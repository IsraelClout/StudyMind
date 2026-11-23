
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

const BUCKET = "academic-materials";

const params = new URLSearchParams(window.location.search);
const documentId = params.get("id");

const status = document.getElementById("viewerStatus");
const viewer = document.getElementById("pdfViewer");
const downloadButton = document.getElementById("downloadButton");

let downloadUrl = null;

function showStatus(text, type = "success") {
    status.textContent = text;
    status.className = `message ${type}`;
    status.hidden = false;
}

async function initializeViewer() {
    const user = await requireAuth();
    if (!user) return;

    if (!documentId) {
        showStatus("No document was selected.", "error");
        return;
    }

    const { data: document, error } = await supabase
        .from("documents")
        .select("*")
        .eq("id", documentId)
        .eq("owner_id", user.id)
        .single();

    if (error || !document) {
        showStatus("Document not found or access denied.", "error");
        return;
    }

    document.title = document.title || document.original_filename;

    document.getElementById?.("unused");

    window.document.getElementById("documentTitle").textContent =
        document.title;

    window.document.getElementById("documentInfo").textContent =
        `${document.original_filename} • ${(document.file_size / 1048576).toFixed(2)} MB`;

    // Create a short-lived private access URL.

    const { data: signed, error: signedError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(document.storage_path, 300);

    if (signedError) {
        showStatus("Unable to access this document.", "error");
        return;
    }

    downloadUrl = signed.signedUrl;

    downloadButton.disabled = false;

    const extension = document.file_type.toLowerCase();

    if (extension === "pdf") {
        viewer.src = downloadUrl;
        viewer.hidden = false;
        status.hidden = true;
    } else {
        showStatus(
            `This ${extension.toUpperCase()} file is available for download. PDF preview is currently supported.`,
            "success"
        );
    }
}

downloadButton.addEventListener("click", () => {
    if (!downloadUrl) return;

    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
});

initializeViewer().catch(error => {
    console.error(error);
    showStatus(error.message, "error");
});
