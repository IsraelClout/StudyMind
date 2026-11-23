
import { supabase } from "./supabase.js";
import { requireAuth, logout } from "./auth.js";

let currentUser = null;
let subjects = [];

const form = document.getElementById("subjectForm");
const formCard = document.getElementById("subjectFormCard");
const grid = document.getElementById("subjectsGrid");
const message = document.getElementById("subjectMessage");

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

async function loadSubjects() {
    const { data, error } = await supabase
        .from("subjects")
        .select(`
            *,
            documents(id)
        `)
        .eq("owner_id", currentUser.id)
        .order("created_at", { ascending: false });

    if (error) throw error;

    subjects = data || [];

    renderSubjects();
}

function renderSubjects() {
    document.getElementById("subjectCount").textContent =
        `${subjects.length} subjects`;

    if (!subjects.length) {
        grid.innerHTML = `
            <div class="empty-state">
                You haven't created any subjects yet.
                Create your first course to get started.
            </div>
        `;
        return;
    }

    grid.innerHTML = subjects.map(subject => `
        <article class="subject-card"
            style="border-top: 3px solid ${escapeHTML(subject.color)}">

            <div class="subject-card-icon">📚</div>

            <h3>${escapeHTML(subject.name)}</h3>

            <span class="course-code">
                ${escapeHTML(subject.course_code || "No course code")}
            </span>

            <p>${escapeHTML(subject.description || "No description provided.")}</p>

            <div class="subject-card-footer">
                <span>${subject.documents?.length || 0} materials</span>

                <button class="btn btn-outline"
                    data-open="${subject.id}">
                    View Materials
                </button>
            </div>

            <button class="subject-delete"
                data-delete="${subject.id}">
                Delete Subject
            </button>

        </article>
    `).join("");
}

document.getElementById("addSubjectButton")
    .addEventListener("click", () => {
        formCard.hidden = false;
        document.getElementById("subjectName").focus();
    });

document.getElementById("cancelSubjectButton")
    .addEventListener("click", () => {
        form.reset();
        formCard.hidden = true;
        message.textContent = "";
    });

form.addEventListener("submit", async event => {
    event.preventDefault();

    const name = document.getElementById("subjectName")
        .value.trim();

    const courseCode = document.getElementById("courseCode")
        .value.trim();

    const description = document.getElementById("subjectDescription")
        .value.trim();

    const color = document.getElementById("subjectColor").value;

    if (!name) return;

    const saveButton = form.querySelector('[type="submit"]');

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    try {
        const { error } = await supabase
            .from("subjects")
            .insert({
                owner_id: currentUser.id,
                name,
                course_code: courseCode || null,
                description: description || null,
                color
            });

        if (error) throw error;

        form.reset();
        formCard.hidden = true;

        await loadSubjects();

    } catch (error) {
        message.textContent = error.message;
        message.className = "message error";
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Save Subject";
    }
});

grid.addEventListener("click", async event => {
    const open = event.target.closest("[data-open]");
    const remove = event.target.closest("[data-delete]");

    if (open) {
        window.location.href =
            `/materials.html?subject=${encodeURIComponent(open.dataset.open)}`;
    }

    if (remove) {
        const subject = subjects.find(
            item => item.id === remove.dataset.delete
        );

        if (!subject) return;

        if (!confirm(`Delete ${subject.name}? Its materials will become unassigned.`)) {
            return;
        }

        const { error } = await supabase
            .from("subjects")
            .delete()
            .eq("id", subject.id)
            .eq("owner_id", currentUser.id);

        if (error) {
            alert(error.message);
            return;
        }

        await loadSubjects();
    }
});

async function initialize() {
    currentUser = await requireAuth();
    if (!currentUser) return;

    document.getElementById("logoutButton")
        .addEventListener("click", logout);

    await loadSubjects();
}

initialize().catch(error => {
    console.error(error);
    grid.textContent = error.message;
});
