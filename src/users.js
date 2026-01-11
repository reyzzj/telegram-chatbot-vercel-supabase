import { supabase } from "./supabase.js";

export async function getUser(telegramUserId) {
  const { data, error } = await supabase
    .from("users")
    .select("telegram_user_id, role, full_name, company, platoon, username, first_name, last_name, created_at, last_seen_at")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function touchUser(from) {
  // Update lightweight fields without creating a new user (registration required).
  if (!from?.id) return;

  const patch = {
    username: from.username ?? null,
    first_name: from.first_name ?? null,
    last_name: from.last_name ?? null,
    last_seen_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("users")
    .update(patch)
    .eq("telegram_user_id", from.id);

  // If user isn't registered yet, update will affect 0 rows; that's fine.
  if (error) throw error;
}

export async function registerTrooper({ from, full_name, company, platoon }) {
  if (!from?.id) throw new Error("Missing Telegram user id");

  const row = {
    telegram_user_id: from.id,
    role: "trooper",
    full_name,
    company,
    platoon,
    username: from.username ?? null,
    first_name: from.first_name ?? null,
    last_name: from.last_name ?? null,
    last_seen_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("users").insert(row);
  if (error) throw error;
}
