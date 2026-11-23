
import { supabase } from "./supabase.js";

const form = document.getElementById("forgotForm");
const message = document.getElementById("forgotMessage");
const button = document.getElementById("forgotButton");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();

    button.disabled = true;
    button.textContent = "Sending...";

    try {
        const { error } = await supabase.auth.resetPasswordForEmail(
            email,
            {
                redirectTo:
                    `${window.location.origin}/reset-password.html`
            }
        );

        if (error) throw error;

        message.textContent =
            "If an account exists for this address, a password reset link will be sent.";
        message.className = "message success";

    } catch (error) {
        message.textContent = error.message;
        message.className = "message error";
    } finally {
        button.disabled = false;
        button.textContent = "Send Reset Link";
    }
});
