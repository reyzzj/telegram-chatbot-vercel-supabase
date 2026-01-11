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
    .update({ username: username ?? null })
    .eq("telegram_user_id", telegramUserId);

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

export async function updateUserInfo({
  telegram_user_id,
  username,
  full_name,
  company,
  platoon,
}) {
  const { error } = await supabase
    .from("users")
    .update({
      username: username ?? null,
      full_name,
      company,
      platoon,
    })
    .eq("telegram_user_id", telegram_user_id);

  if (error) throw error;
}

export async function getOpenSrtSession(telegramUserId) {
  const { data, error } = await supabase
    .from("srt_sessions")
    .select("id, telegram_user_id, clock_in_at, clock_out_at, wellness_ok")
    .eq("telegram_user_id", telegramUserId)
    .is("clock_out_at", null)
    .order("clock_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function srtClockIn({ telegram_user_id, role, wellness_ok }) {
  const { error } = await supabase.from("srt_sessions").insert({
    telegram_user_id,
    role,
    wellness_ok,
  });

  if (error) throw error;
}

export async function srtClockOut({ telegram_user_id }) {
  const { error } = await supabase
    .from("srt_sessions")
    .update({ clock_out_at: new Date().toISOString() })
    .eq("telegram_user_id", telegram_user_id)
    .is("clock_out_at", null);

  if (error) throw error;
}
