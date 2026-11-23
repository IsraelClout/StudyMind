
import { supabase } from "./supabase.js";

const form = document.getElementById("resetForm");
const message = document.getElementById("resetMessage");
const button = document.getElementById("resetButton");

let recoveryReady = false;

async function initializeRecovery() {
    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session) {
        message.textContent =
            "Your reset link is invalid or expired. Request a new one.";
        message.className = "message error";
        button.disabled = true;
        return;
    }

    recoveryReady = true;
}

supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" && session) {
        recoveryReady = true;
        message.textContent = "Choose your new password.";
        message.className = "message success";
    }
});

initializeRecovery();

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!recoveryReady) {
        message.textContent = "Please open a valid password reset link.";
        message.className = "message error";
        return;
    }

    const password = document.getElementById("password").value;
    const confirmPassword =
        document.getElementById("confirmPassword").value;

    if (password.length < 8 || password !== confirmPassword) {
        message.textContent = "Check your password length and confirmation.";
        message.className = "message error";
        return;
    }

    button.disabled = true;

    try {
        const { error } = await supabase.auth.updateUser({
            password
        });

        if (error) throw error;

        message.textContent = "Password updated successfully. You can now log in.";
        message.className = "message success";

        form.reset();

    } catch (error) {
        message.textContent = error.message;
        message.className = "message error";
    } finally {
        button.disabled = false;
    }
});
