
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

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

const EMBEDDING_MODEL = "text-embedding-3-small";
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-6-luna";

function send(res, status, data) {
    return res.status(status).json(data);
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return send(res, 405, { error: "Method not allowed." });
    }

    try {
        // 1. Authenticate the student.
        const authorization = req.headers.authorization || "";
        const token = authorization.startsWith("Bearer ")
            ? authorization.slice(7)
            : null;

        if (!token) {
            return send(res, 401, {
                error: "Please log in before asking a question."
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

        // 2. Validate the question.
        const question = req.body?.question?.trim();
        const documentId = req.body?.documentId || null;

        if (
            typeof question !== "string" ||
            question.length < 2 ||
            question.length > 4000
        ) {
            return send(res, 400, {
                error: "Enter a question between 2 and 4,000 characters."
            });
        }

        if (
            documentId !== null &&
            (
                typeof documentId !== "string" ||
                !/^[0-9a-f-]{36}$/i.test(documentId)
            )
        ) {
            return send(res, 400, {
                error: "Invalid document selection."
            });
        }

        // 3. If a document was selected, verify ownership and status.
        if (documentId) {
            const { data: selectedDocument, error } =
                await supabaseAdmin
                    .from("documents")
                    .select("id, processing_status")
                    .eq("id", documentId)
                    .eq("owner_id", user.id)
                    .single();

            if (error || !selectedDocument) {
                return send(res, 404, {
                    error: "Selected document was not found."
                });
            }

            if (selectedDocument.processing_status !== "completed") {
                return send(res, 409, {
                    error: "This document has not finished processing."
                });
            }
        }

        // 4. Convert the question into an embedding.
        const embeddingResponse = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: question,
            encoding_format: "float"
        });

        const queryEmbedding =
            embeddingResponse.data[0].embedding;

        // 5. Search only this student's document chunks.
        const { data: matches, error: searchError } =
            await supabaseAdmin.rpc("match_document_chunks", {
                p_owner_id: user.id,
                p_query_embedding: JSON.stringify(queryEmbedding),
                p_match_count: 8,
                p_document_id: documentId
            });

        if (searchError) {
            console.error("Vector search error:", searchError);
            throw new Error("Could not search your study materials.");
        }

        if (!matches || matches.length === 0) {
            return send(res, 200, {
                answer:
                    "I couldn't find processed study material relevant to that question. Upload and process your lecture notes first, or try asking the question using different words.",
                sources: [],
                basedOnMaterials: false
            });
        }

        // 6. Retrieve the source document details.
        const documentIds = [
            ...new Set(matches.map(match => match.document_id))
        ];

        const { data: documents, error: documentsError } =
            await supabaseAdmin
                .from("documents")
                .select("id, title, original_filename")
                .eq("owner_id", user.id)
                .in("id", documentIds);

        if (documentsError) throw documentsError;

        const documentMap = new Map(
            (documents || []).map(doc => [doc.id, doc])
        );

        // 7. Prepare the retrieved context and source references.
        const sources = matches.map((match, index) => {
            const doc = documentMap.get(match.document_id);

            return {
                reference: index + 1,
                documentId: match.document_id,
                title: doc?.title || doc?.original_filename || "Study material",
                chunkIndex: match.chunk_index,
                similarity: Number(match.similarity.toFixed(4))
            };
        });

        const context = matches.map((match, index) => {
            const source = sources[index];

            return `
[SOURCE ${source.reference}]
Document: ${source.title}
Section: ${source.chunkIndex + 1}

${match.content}
`;
        }).join("\n\n");

        // 8. Generate an answer grounded in the retrieved context.
        const response = await openai.responses.create({
            model: CHAT_MODEL,
            instructions: `
You are StudyMind AI, an intelligent academic tutor.

Your main responsibility is to help students understand their academic materials.

RULES:
1. Use the supplied study material as your primary source.
2. Never pretend that information is in a document when it is not.
3. If the supplied context does not contain enough information, say so clearly.
4. You may explain concepts using your general knowledge, but distinguish that from information found in the student's materials.
5. Explain difficult concepts in clear, beginner-friendly language.
6. Use examples when helpful.
7. When you use information from a supplied source, cite it using [SOURCE 1], [SOURCE 2], etc.
8. Never invent source references.
9. Use headings and numbered steps when they improve clarity.
10. Be encouraging, accurate and educational.
`,
            input: `
STUDENT QUESTION:
${question}

RETRIEVED STUDY MATERIAL:
${context}

Answer the student's question. Cite the supplied sources where relevant.
`
        });

        const answer = response.output_text?.trim();

        if (!answer) {
            throw new Error("The AI returned an empty answer.");
        }

        return send(res, 200, {
            success: true,
            answer,
            sources,
            basedOnMaterials: true
        });

    } catch (error) {
        console.error("StudyMind AI question error:", error);

        return send(res, 500, {
            error: error.message || "Something went wrong while answering."
        });
    }
}
