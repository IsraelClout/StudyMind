
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, "index.html"),
                login: resolve(__dirname, "login.html"),
                register: resolve(__dirname, "register.html"),
                dashboard: resolve(__dirname, "dashboard.html"),
                forgotPassword: resolve(__dirname, "forgot-password.html"),
                resetPassword: resolve(__dirname, "reset-password.html"),
                materials: resolve(__dirname, "materials.html"),
                subjects: resolve(__dirname, "subjects.html"),
                documentViewer: resolve(__dirname, "document-viewer.html")
            }
        }
    }
});
tutor: resolve(__dirname, "tutor.html"),
