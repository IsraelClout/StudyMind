
import { supabase } from "./supabase.js";

import {
    requireAuth,
    getProfile,
    logout
} from "./auth.js";

const BUCKET = "academic-materials";
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const allowedExtensions = [
    "pdf", "docx", "doc", "pptx", "ppt", "txt", "csv"
];

let currentUser = null;
let allDocuments = [];
let allSubjects = [];

const grid = document.getElementById("materialsGrid");
const fileInput = document.getElementById("fileInput");
const uploadStatus = document.getElementById("uploadStatus");

function extensionOf(filename) {
    return filename.split(".").pop().toLowerCase();
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
}

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function showMessage(text, type = "success") {
    uploadStatus.textContent = text;
    uploadStatus.className = `message ${type}`;
}

async function loadSubjects() {
    const { data, error } = await supabase
        .from("subjects")
        .select("*")
        .eq("owner_id", currentUser.id)
        .order("name");

    if (error) throw error;

    allSubjects = data || [];

    const filter = document.getElementById("subjectFilter");

    filter.innerHTML =
        '<option value="all">All Subjects</option>';

    allSubjects.forEach(subject => {
        const option = document.createElement("option");

        option.value = subject.id;
        option.textContent = subject.name;

        filter.appendChild(option);
    });

    document.getElementById("totalSubjects").textContent =
        allSubjects.length;
}

async function loadDocuments() {
    const { data, error } = await supabase
        .from("documents")
        .select(`
            *,
            subjects (
                name
            )
        `)
        .eq("owner_id", currentUser.id)
        .order("created_at", { ascending: false });

    if (error) throw error;

    allDocuments = data || [];

    renderDocuments();
    updateStatistics();
}

function updateStatistics() {
    document.getElementById("totalDocuments").textContent =
        allDocuments.length;

    const totalBytes = allDocuments.reduce(
        (total, file) => total + Number(file.file_size || 0),
        0
    );

    document.getElementById("storageUsed").textContent =
        `${(totalBytes / 1048576).toFixed(2)} MB`;
}

function renderDocuments() {
    const search = document.getElementById("searchMaterials")
        .value.toLowerCase();

    const subject = document.getElementById("subjectFilter").value;
    const type = document.getElementById("typeFilter").value;

    const filtered = allDocuments.filter(file => {
        const matchesSearch =
            file.title.toLowerCase().includes(search) ||
            file.original_filename.toLowerCase().includes(search);

        const matchesSubject =
            subject === "all" || file.subject_id === subject;

        const matchesType =
            type === "all" || file.file_type === type;

        return matchesSearch && matchesSubject && matchesType;
    });

    if (!filtered.length) {
        grid.innerHTML = `
            <div class="empty-state">
                No academic materials found.
                Upload your first document to get started.
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(file => {
        const icon = {
            pdf: "📕",
            docx: "📘",
            doc: "📘",
            pptx: "📙",
            ppt: "📙",
            txt: "📄",
            csv: "📊"
        }[file.file_type] || "📄";

        return `
            <article class="material-card">

                <div class="material-card-top">
                    <span class="material-file-icon">${icon}</span>

                    <button
                        class="delete-material"
                        data-delete="${file.id}"
                        title="Delete document">
                        ⋮
                    </button>
                </div>

                <h3>${escapeHTML(file.title)}</h3>

                <p class="material-filename">
                    ${escapeHTML(file.original_filename)}
                </p>

                <div class="material-meta">
                    <span>${formatSize(file.file_size)}</span>
                    <span>${escapeHTML(file.file_type.toUpperCase())}</span>
                </div>

                <div class="material-subject">
                    ${escapeHTML(file.subjects?.name || "Unassigned")}
                </div>

                <div class="processing-status">
                    ${escapeHTML(file.processing_status)}
                </div>

                <button
                    class="btn btn-outline full-width"
                    data-view="${file.id}">
                    Open Material
                </button>

            </article>
        `;
    }).join("");
}

async function uploadFile(file, subjectId = null) {
    const extension = extensionOf(file.name);

    if (!allowedExtensions.includes(extension)) {
        throw new Error(`Unsupported file: ${file.name}`);
    }

    if (file.size > MAX_FILE_SIZE) {
        throw new Error(`${file.name} exceeds the 20 MB limit.`);
    }

    if (file.size === 0) {
        throw new Error(`${file.name} is empty.`);
    }

    // Check that the selected subject belongs to this student.

    if (subjectId) {
        const subjectExists = allSubjects.some(
            item => item.id === subjectId
        );

        if (!subjectExists) {
            throw new Error("Invalid subject selected.");
        }
    }

    const documentId = crypto.randomUUID();

    const safeName = file.name
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 150);

    const storagePath =
        `${currentUser.id}/${documentId}/${safeName}`;

    // Upload actual file to private Supabase storage.

    const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || "application/octet-stream"
        });

    if (uploadError) throw uploadError;

    // Save metadata in PostgreSQL.

    const { error: databaseError } = await supabase
        .from("documents")
        .insert({
            id: documentId,
            owner_id: currentUser.id,
            subject_id: subjectId || null,
            title: file.name.replace(/\.[^/.]+$/, ""),
            original_filename: file.name,
            storage_path: storagePath,
            file_type: extension,
            mime_type: file.type || null,
            file_size: file.size,
            processing_status: "uploaded"
        });

    if (databaseError) {
        // Avoid leaving an untracked file in storage.
        await supabase.storage.from(BUCKET).remove([storagePath]);
        throw databaseError;
    }

    return documentId;
}

async function handleUploads(files) {
    const selectedFiles = Array.from(files);

    if (!selectedFiles.length) return;

    const subjectId = await chooseSubject();

    if (subjectId === undefined) return;

    let successful = 0;

    for (const file of selectedFiles) {
        try {
            showMessage(`Uploading ${file.name}...`, "success");

            await uploadFile(file, subjectId);

            successful++;

        } catch (error) {
            showMessage(`${file.name}: ${error.message}`, "error");
            console.error(error);
        }
    }

    await loadDocuments();

    if (successful > 0) {
        showMessage(
            `${successful} of ${selectedFiles.length} file(s) uploaded successfully.`,
            "success"
        );
    }

    fileInput.value = "";
}

async function chooseSubject() {
    const options = [
        "No subject",
        ...allSubjects.map(subject => subject.name)
    ];

    const choice = prompt(
        "Select subject:\n" +
        options.map((item, index) => `${index}: ${item}`).join("\n") +
        "\n\nEnter subject number:",
        "0"
    );

    if (choice === null) return undefined;

    const index = Number(choice);

    if (!Number.isInteger(index) || index < 0 ||
        index >= options.length) {
        alert("Invalid subject selection.");
        return undefined;
    }

    return index === 0 ? null : allSubjects[index - 1].id;
}

async function deleteDocument(documentId) {
    const document = allDocuments.find(
        item => item.id === documentId
    );

    if (!document) return;

    const confirmed = confirm(
        `Delete "${document.title}" permanently?`
    );

    if (!confirmed) return;

    // Delete metadata first so that it is no longer accessible
    // through the application.

    const { error: databaseError } = await supabase
        .from("documents")
        .delete()
        .eq("id", documentId)
        .eq("owner_id", currentUser.id);

    if (databaseError) throw databaseError;

    // Delete the actual file.

    const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .remove([document.storage_path]);

    await loadDocuments();

    if (storageError) {
        showMessage(
            "Document record deleted, but storage cleanup failed. Please retry cleanup.",
            "error"
        );
        console.error(storageError);
        return;
    }

    showMessage("Document deleted successfully.", "success");
}

async function initialize() {
    currentUser = await requireAuth();

    if (!currentUser) return;

    const profile = await getProfile(currentUser.id);

    document.getElementById("userName").textContent =
        profile.full_name;

    document.getElementById("userAvatar").textContent =
        profile.full_name.charAt(0).toUpperCase();

    await loadSubjects();
    
const requestedSubject =
    new URLSearchParams(window.location.search).get("subject");

if (requestedSubject &&
    allSubjects.some(subject => subject.id === requestedSubject)) {
    document.getElementById("subjectFilter").value = requestedSubject;
}
    
    await loadDocuments();

    document.getElementById("openUploadButton")
        .addEventListener("click", () => fileInput.click());

    document.getElementById("browseButton")
        .addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", event => {
        handleUploads(event.target.files);
    });

    const dropZone = document.getElementById("dropZone");

    dropZone.addEventListener("dragover", event => {
        event.preventDefault();
        dropZone.classList.add("drag-active");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("drag-active");
    });

    dropZone.addEventListener("drop", event => {
        event.preventDefault();
        dropZone.classList.remove("drag-active");
        handleUploads(event.dataTransfer.files);
    });

    document.getElementById("searchMaterials")
        .addEventListener("input", renderDocuments);

    document.getElementById("subjectFilter")
        .addEventListener("change", renderDocuments);

    document.getElementById("typeFilter")
        .addEventListener("change", renderDocuments);

    grid.addEventListener("click", async event => {
        const viewButton = event.target.closest("[data-view]");
        const deleteButton = event.target.closest("[data-delete]");

        try {
            if (viewButton) {
                window.location.href =
                    `/document-viewer.html?id=${encodeURIComponent(viewButton.dataset.view)}`;
            }

            if (deleteButton) {
                await deleteDocument(deleteButton.dataset.delete);
            }
        } catch (error) {
            showMessage(error.message, "error");
        }
    });

    document.getElementById("logoutButton")
        .addEventListener("click", logout);
}

initialize().catch(error => {
    console.error(error);
    showMessage(error.message, "error");
});
