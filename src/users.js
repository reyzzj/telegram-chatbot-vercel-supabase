import { supabase } from "./supabase.js";

export async function getUser(telegramUserId) {
  const { data, error } = await supabase
    .from("users")
    .select("telegram_user_id, username, full_name, role, company, platoon, created_at")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

// Update username if user exists (no auto-create)
export async function touchUser(from) {
  if (!from?.id) return;

  const { error } = await supabase
    .from("users")
    .update({ username: from.username ?? null })
    .eq("telegram_user_id", from.id);

  if (error) throw error;
}

export async function registerTrooper({
  telegram_user_id,
  full_name,
  company,
  platoon,
  username = null,
}) {
  const row = {
    telegram_user_id,
    username,
    full_name,
    role: "trooper",
    company,
    platoon,
  };

  const { error } = await supabase.from("users").insert(row);
  if (error) throw error;
}