
import { supabase } from "./supabase.js";

const form = document.getElementById("registerForm");
const message = document.getElementById("registerMessage");
const button = document.getElementById("registerButton");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const fullName = document.getElementById("fullName").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword =
        document.getElementById("confirmPassword").value;

    message.textContent = "";
    message.className = "message";

    if (password.length < 8) {
        message.textContent = "Password must contain at least 8 characters.";
        message.classList.add("error");
        return;
    }

    if (password !== confirmPassword) {
        message.textContent = "Passwords do not match.";
        message.classList.add("error");
        return;
    }

    button.disabled = true;
    button.textContent = "Creating account...";

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName
                },
                emailRedirectTo:
                    `${window.location.origin}/dashboard.html`
            }
        });

        if (error) throw error;

        if (data.session) {
            window.location.href = "/dashboard.html";
        } else {
            message.textContent =
                "Account created! Check your email and verify your account before logging in.";
            message.classList.add("success");
            form.reset();
        }

    } catch (error) {
        message.textContent = error.message;
        message.classList.add("error");
    } finally {
        button.disabled = false;
        button.textContent = "Create Account";
    }
});
