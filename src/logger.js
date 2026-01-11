import { supabase } from "./supabase.js";

export async function upsertUser(from) {
  if (!from?.id) return;
  const user = {
    telegram_user_id: from.id,
    username: from.username ?? null,
    first_name: from.first_name ?? null,
    last_name: from.last_name ?? null,
    last_seen_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("users").upsert(user, { onConflict: "telegram_user_id" });
  if (error) console.error("Supabase upsertUser error:", error);
}

export async function logMessage({ telegram_user_id, chat_id, direction, message }) {
  if (!telegram_user_id || !chat_id || !direction || !message) return;
  const { error } = await supabase.from("message_logs").insert({
    telegram_user_id,
    chat_id,
    direction,
    message,
  });
  if (error) console.error("Supabase logMessage error:", error);
}
