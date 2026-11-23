
import { supabase } from "./supabase.js";
import {
    requireAuth,
    getProfile,
    logout
} from "./auth.js";

async function initializeDashboard() {

    const user = await requireAuth();

    if (!user) return;

    try {
        const profile = await getProfile(user.id);

        document.getElementById("userName").textContent =
            profile.full_name;

        document.getElementById("welcomeMessage").textContent =
            `Welcome back, ${profile.full_name.split(" ")[0]}!`;

        document.getElementById("userAvatar").textContent =
            profile.full_name.charAt(0).toUpperCase();

    } catch (error) {
        console.error("Profile loading failed:", error);
    }

    // Feature navigation is connected to future modules.
    document.querySelectorAll("[data-feature]").forEach((link) => {
        link.addEventListener("click", (event) => {
            event.preventDefault();

            const feature = link.dataset.feature;

            const pages = {
                tutor: "tutor.html",
                materials: "materials.html",
                exams: "exams.html",
                summaries: "summaries.html",
                analytics: "analytics.html"
            };

            if (pages[feature]) {
                window.location.href = `/${pages[feature]}`;
            }
        });
    });

    document.getElementById("logoutButton")
        .addEventListener("click", async () => {
            try {
                await logout();
            } catch (error) {
                alert("Logout failed: " + error.message);
            }
        });
}

initializeDashboard();
