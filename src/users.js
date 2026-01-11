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

export async function updateUsernameIfExists(telegramUserId, username) {
  const { error } = await supabase
    .from("users")
    .update({ username })
    .eq("telegram_user_id", telegramUserId);

  // If user doesn't exist, this updates 0 rows and error is null -> ok
  if (error) throw error;
}

export async function registerTrooperOnce({
  telegram_user_id,
  username,
  full_name,
  company,
  platoon,
}) {
  const { error } = await supabase.from("users").insert({
    telegram_user_id,
    username: username ?? null,
    full_name,
    role: "trooper",
    company,
    platoon,
  });

  if (error) throw error;
}
