import { supabase } from "./supabase.js";

/* Get user by Telegram ID */
export async function getUser(telegramUserId) {
  const { data, error } = await supabase
    .from("users")
    .select(
      "telegram_user_id, username, full_name, role, company, platoon, created_at"
    )
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/* Update username if user exists */
export async function touchUser(from) {
  if (!from?.id) return;

  const { error } = await supabase
    .from("users")
    .update({
      username: from.username ?? null,
    })
    .eq("telegram_user_id", from.id);

  if (error) throw error;
}

/* Register new trooper */
export async function registerTrooper({
  telegram_user_id,
  username,
  full_name,
  company,
  platoon,
}) {
  const { error } = await supabase.from("users").insert({
    telegram_user_id,
    username,
    full_name,
    role: "trooper",
    company,
    platoon,
  });

  if (error) throw error;
}
