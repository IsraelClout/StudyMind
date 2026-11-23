
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import pdf from "pdf-parse";
import mammoth from "mammoth";
import JSZip from "jszip";

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

const supabaseAuth = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const BUCKET = "academic-materials";
const EMBEDDING_MODEL = "text-embedding-3-small";
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;

function send(res, status, data) {
    return res.status(status).json(data);
}

function decodeXml(value) {
    return value
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, code) =>
            String.fromCodePoint(Number(code))
        )
        .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
            String.fromCodePoint(parseInt(code, 16))
        );
}

async function extractPptx(buffer) {
    const zip = await JSZip.loadAsync(buffer);

    const slideFiles = Object.keys(zip.files)
        .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
        .sort((a, b) => {
            const numberA = Number(a.match(/slide(\d+)/i)[1]);
            const numberB = Number(b.match(/slide(\d+)/i)[1]);
            return numberA - numberB;
        });

    const slides = [];

    for (let i = 0; i < slideFiles.length; i++) {
        const xml = await zip.files[slideFiles[i]].async("text");

        const textParts = [
            ...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)
        ].map(match => decodeXml(match[1]));

        const slideText = textParts.join(" ").trim();

        if (slideText) {
            slides.push(`Slide ${i + 1}\n${slideText}`);
        }
    }

    return slides.join("\n\n");
}

async function extractText(buffer, filename) {
    const extension = filename.split(".").pop().toLowerCase();

    if (extension === "pdf") {
        const result = await pdf(buffer);
        return result.text;
    }

    if (extension === "docx") {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
    }

    if (extension === "pptx") {
        return await extractPptx(buffer);
    }

    if (["txt", "csv"].includes(extension)) {
        return buffer.toString("utf8");
    }

    if (extension === "doc") {
        throw new Error(
            "Legacy .doc files are not supported yet. Please save this file as .docx."
        );
    }

    if (extension === "ppt") {
        throw new Error(
            "Legacy .ppt files are not supported yet. Please save this file as .pptx."
        );
    }

    throw new Error("Unsupported document format.");
}

function cleanText(text) {
    return text
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\u0000/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function createChunks(text) {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
        let end = Math.min(start + CHUNK_SIZE, text.length);

        if (end < text.length) {
            const paragraphBreak = text.lastIndexOf("\n\n", end);
            const sentenceBreak = text.lastIndexOf(". ", end);
            const preferredBreak = Math.max(
                paragraphBreak,
                sentenceBreak
            );

            if (preferredBreak > start + CHUNK_SIZE * 0.6) {
                end = preferredBreak + 1;
            }
        }

        const content = text.slice(start, end).trim();

        if (content.length >= 30) {
            chunks.push(content);
        }

        if (end >= text.length) break;

        const nextStart = Math.max(end - CHUNK_OVERLAP, start + 1);
        start = nextStart;
    }

    return chunks;
}

async function generateAndSaveChunks(chunks, document, userId) {
    // Remove previous chunks so reprocessing does not create duplicates.
    const { error: deleteError } = await supabaseAdmin
        .from("document_chunks")
        .delete()
        .eq("document_id", document.id)
        .eq("owner_id", userId);

    if (deleteError) throw deleteError;

    const batchSize = 50;
    let savedCount = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);

        const embeddingResponse = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: batch,
            encoding_format: "float"
        });

        const rows = batch.map((content, index) => ({
            owner_id: userId,
            document_id: document.id,
            chunk_index: i + index,
            content,
            embedding: JSON.stringify(
                embeddingResponse.data[index].embedding
            ),
            metadata: {
                filename: document.original_filename,
                file_type: document.file_type
            }
        }));

        const { error } = await supabaseAdmin
            .from("document_chunks")
            .insert(rows);

        if (error) throw error;

        savedCount += rows.length;
    }

    return savedCount;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return send(res, 405, {
            error: "Method not allowed."
        });
    }

    let documentId;
    let userId;

    try {
        const authorization = req.headers.authorization || "";
        const token = authorization.startsWith("Bearer ")
            ? authorization.slice(7)
            : null;

        if (!token) {
            return send(res, 401, {
                error: "Authentication required."
            });
        }

        const {
            data: { user },
            error: authError
        } = await supabaseAuth.auth.getUser(token);

        if (authError || !user) {
            return send(res, 401, {
                error: "Your session is invalid or expired."
            });
        }

        userId = user.id;
        documentId = req.body?.documentId;

        if (
            typeof documentId !== "string" ||
            !/^[0-9a-f-]{36}$/i.test(documentId)
        ) {
            return send(res, 400, {
                error: "A valid document ID is required."
            });
        }

        const { data: document, error: documentError } =
            await supabaseAdmin
                .from("documents")
                .select("*")
                .eq("id", documentId)
                .eq("owner_id", userId)
                .single();

        if (documentError || !document) {
            return send(res, 404, {
                error: "Document not found."
            });
        }

        if (!document.storage_path) {
            return send(res, 400, {
                error: "Document has no storage path."
            });
        }

        await supabaseAdmin
            .from("documents")
            .update({
                processing_status: "processing",
                processing_error: null
            })
            .eq("id", documentId)
            .eq("owner_id", userId);

        const { data: file, error: downloadError } =
            await supabaseAdmin.storage
                .from(BUCKET)
                .download(document.storage_path);

        if (downloadError || !file) {
            throw new Error(
                downloadError?.message || "Could not download document."
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // Avoid processing unexpectedly large files in this first version.
        if (buffer.length > 20 * 1024 * 1024) {
            throw new Error("Document exceeds the 20MB processing limit.");
        }

        const extractedText = await extractText(
            buffer,
            document.original_filename
        );

        const cleanedText = cleanText(extractedText);

        if (cleanedText.length < 30) {
            throw new Error(
                "No readable text was found. This may be a scanned document. OCR support will be added later."
            );
        }

        const chunks = createChunks(cleanedText);

        if (!chunks.length) {
            throw new Error("Could not create searchable text sections.");
        }

        const savedCount = await generateAndSaveChunks(
            chunks,
            document,
            userId
        );

        const { error: updateError } = await supabaseAdmin
            .from("documents")
            .update({
                processing_status: "completed",
                processing_error: null
            })
            .eq("id", documentId)
            .eq("owner_id", userId);

        if (updateError) throw updateError;

        return send(res, 200, {
            success: true,
            message: "Document processed successfully.",
            documentId,
            chunksCreated: savedCount,
            charactersExtracted: cleanedText.length
        });

    } catch (error) {
        console.error("Document processing error:", error);

        if (documentId && userId) {
            await supabaseAdmin
                .from("documents")
                .update({
                    processing_status: "failed",
                    processing_error: String(
                        error.message || "Processing failed."
                    ).slice(0, 500)
                })
                .eq("id", documentId)
                .eq("owner_id", userId);
        }

        return send(res, 500, {
            error: error.message || "Document processing failed."
        });
    }
}
