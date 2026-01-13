import { supabase } from "./supabase.js";

const PENDING_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function getPending(telegramUserId) {
  const { data, error } = await supabase
    .from("pending_registrations")
    .select(
      "telegram_user_id, username, full_name, company, platoon, step, mode, extra, updated_at"
    )
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const updatedAt = new Date(data.updated_at).getTime();
  if (Number.isFinite(updatedAt) && Date.now() - updatedAt > PENDING_TIMEOUT_MS) {
    await supabase
      .from("pending_registrations")
      .delete()
      .eq("telegram_user_id", telegramUserId);
    return null;
  }

  return data;
}

export async function startPending({ telegram_user_id, username, mode }) {
  const row = {
    telegram_user_id,
    username: username ?? null,
    mode: mode ?? "register",
    step: "await_full_name",
    full_name: null,
    company: null,
    platoon: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("pending_registrations")
    .upsert(row, { onConflict: "telegram_user_id" });

  if (error) throw error;
}

export async function startClockInPending({ telegram_user_id, username }) {
  const row = {
    telegram_user_id,
    username: username ?? null,
    mode: "clockin",
    // Clock-in flow is multi-step; start by asking for location.
    step: "await_location",
    full_name: null,
    company: null,
    platoon: null,
    extra: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("pending_registrations")
    .upsert(row, { onConflict: "telegram_user_id" });

  if (error) throw error;
}

export async function setPendingStep(telegramUserId, patch) {
  const { error } = await supabase
    .from("pending_registrations")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("telegram_user_id", telegramUserId);

  if (error) throw error;
}

export function safeParseExtra(extra) {
  if (!extra) return {};
  try {
    const obj = JSON.parse(extra);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

export function stringifyExtra(obj) {
  try {
    return JSON.stringify(obj ?? {});
  } catch {
    return "{}";
  }
}

export async function deletePending(telegramUserId) {
  const { error } = await supabase
    .from("pending_registrations")
    .delete()
    .eq("telegram_user_id", telegramUserId);

  if (error) throw error;
}
