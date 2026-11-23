
import { supabase } from "./supabase.js";

export async function requireAuth() {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
        window.location.replace("/login.html");
        return null;
    }

    return data.user;
}

export async function getProfile(userId) {
    const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .eq("id", userId)
        .single();

    if (error) {
        throw error;
    }

    return data;
}

export async function logout() {
    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    window.location.replace("/login.html");
}
