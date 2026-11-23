
import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

const documentSelect = document.getElementById("documentSelect");
const chatMessages = document.getElementById("chatMessages");
const questionForm = document.getElementById("questionForm");
const questionInput = document.getElementById("questionInput");
const sendButton = document.getElementById("sendQuestionBtn");
const tutorStatus = document.getElementById("tutorStatus");

let currentUser = null;

function addMessage(role, content, sources = []) {
    const wrapper = document.createElement("article");
    wrapper.className = `chat-message ${role}`;

    const avatar = document.createElement("div");
    avatar.className = "ai-avatar";
    avatar.textContent = role === "assistant" ? "S" : "You";

    const body = document.createElement("div");
    body.className = "chat-message-body";

    const heading = document.createElement("strong");
    heading.textContent = role === "assistant"
        ? "StudyMind AI"
        : "You";

    const paragraph = document.createElement("p");
    paragraph.className = "chat-message-text";
    paragraph.textContent = content;

    body.append(heading, paragraph);

    if (sources.length) {
        const sourceContainer = document.createElement("div");
        sourceContainer.className = "answer-sources";

        const sourceHeading = document.createElement("strong");
        sourceHeading.textContent = "Sources used";
        sourceContainer.appendChild(sourceHeading);

        sources.forEach(source => {
            const link = document.createElement("a");

            link.href =
                `/document-viewer.html?id=${encodeURIComponent(source.documentId)}`;

            link.textContent =
                `[${source.reference}] ${source.title} — section ${source.chunkIndex + 1}`;

            sourceContainer.appendChild(link);
        });

        body.appendChild(sourceContainer);
    }

    wrapper.append(avatar, body);
    chatMessages.appendChild(wrapper);

    chatMessages.scrollTop = chatMessages.scrollHeight;

    return wrapper;
}

async function loadProcessedDocuments() {
    const { data, error } = await supabase
        .from("documents")
        .select("id, title, original_filename")
        .eq("owner_id", currentUser.id)
        .eq("processing_status", "completed")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Document loading error:", error);
        tutorStatus.textContent =
            "Could not load your processed documents.";
        return;
    }

    data.forEach(doc => {
        const option = document.createElement("option");

        option.value = doc.id;
        option.textContent = doc.title || doc.original_filename;

        documentSelect.appendChild(option);
    });
}

function setLoading(loading) {
    sendButton.disabled = loading;
    questionInput.disabled = loading;
    documentSelect.disabled = loading;

    sendButton.textContent = loading
        ? "Thinking..."
        : "Ask StudyMind AI →";
}

async function askQuestion(question) {
    const selectedDocument = documentSelect.value || null;

    setLoading(true);
    tutorStatus.textContent =
        "Searching your materials and preparing an answer...";

    const thinkingMessage = addMessage(
        "assistant",
        "I'm reviewing your study materials. Please wait..."
    );

    try {
        const {
            data: { session },
            error: sessionError
        } = await supabase.auth.getSession();

        if (sessionError || !session?.access_token) {
            throw new Error("Your session expired. Please log in again.");
        }

        const response = await fetch("/api/ask", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                question,
                documentId: selectedDocument
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Unable to answer your question.");
        }

        const answerText = thinkingMessage.querySelector(
            ".chat-message-text"
        );

        answerText.textContent = result.answer;

        if (result.sources?.length) {
            const sourceContainer = document.createElement("div");
            sourceContainer.className = "answer-sources";

            const heading = document.createElement("strong");
            heading.textContent = "Sources used";
            sourceContainer.appendChild(heading);

            result.sources.forEach(source => {
                const link = document.createElement("a");

                link.href =
                    `/document-viewer.html?id=${encodeURIComponent(source.documentId)}`;

                link.textContent =
                    `[${source.reference}] ${source.title} — section ${source.chunkIndex + 1}`;

                sourceContainer.appendChild(link);
            });

            thinkingMessage.querySelector(
                ".chat-message-body"
            ).appendChild(sourceContainer);
        }

        tutorStatus.textContent = result.basedOnMaterials
            ? "Answer generated using your study materials."
            : "No relevant processed material was found.";

    } catch (error) {
        thinkingMessage.querySelector(
            ".chat-message-text"
        ).textContent = `Sorry, ${error.message}`;

        tutorStatus.textContent = "Please try again.";
        console.error(error);
    } finally {
        setLoading(false);
        questionInput.focus();
    }
}

questionForm.addEventListener("submit", async event => {
    event.preventDefault();

    const question = questionInput.value.trim();

    if (!question) return;

    addMessage("user", question);

    questionInput.value = "";

    await askQuestion(question);
});

async function initialize() {
    await requireAuth();

    const {
        data: { user },
        error
    } = await supabase.auth.getUser();

    if (error || !user) {
        window.location.href = "/login.html";
        return;
    }

    currentUser = user;

    await loadProcessedDocuments();
}

initialize().catch(error => {
    console.error(error);
    tutorStatus.textContent =
        "Could not initialize StudyMind AI Tutor.";
});
