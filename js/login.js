
import { supabase } from "./supabase.js";

const form = document.getElementById("loginForm");
const message = document.getElementById("loginMessage");
const button = document.getElementById("loginButton");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    message.textContent = "";
    button.disabled = true;
    button.textContent = "Signing in...";

    try {
        const { data, error } =
            await supabase.auth.signInWithPassword({
                email,
                password
            });

        if (error) throw error;

        if (data.user) {
            window.location.href = "/dashboard.html";
        }

    } catch (error) {
        message.textContent = error.message;
        message.className = "message error";
    } finally {
        button.disabled = false;
        button.textContent = "Sign In";
    }
});
