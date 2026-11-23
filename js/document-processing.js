
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

const processButton = document.getElementById("processDocumentBtn");
const statusElement = document.getElementById("processingStatus");

const documentId = new URLSearchParams(
    window.location.search
).get("id");

function showStatus(message, isError = false) {
    statusElement.textContent = message;
    statusElement.style.color = isError ? "#dc2626" : "inherit";
}

async function processDocument() {
    if (!documentId) {
        showStatus("Document ID is missing.", true);
        return;
    }

    processButton.disabled = true;
    processButton.textContent = "Processing...";
    showStatus("Extracting text and generating embeddings. Please wait.");

    try {
        const {
            data: { session },
            error: sessionError
        } = await supabase.auth.getSession();

        if (sessionError || !session?.access_token) {
            throw new Error("Please log in again.");
        }

        const response = await fetch("/api/process-document", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ documentId })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Document processing failed.");
        }

        showStatus(
            `Successfully processed! ${result.chunksCreated} searchable sections created.`
        );

        processButton.textContent = "Process Again";
    } catch (error) {
        console.error(error);
        showStatus(error.message, true);
        processButton.textContent = "Try Again";
    } finally {
        processButton.disabled = false;
    }
}

async function initializeProcessing() {
    await requireAuth();

    processButton?.addEventListener("click", processDocument);
}

initializeProcessing().catch(error => {
    console.error(error);
    showStatus("Could not initialize document processing.", true);
});
