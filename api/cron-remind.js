import { Bot } from "grammy";
import { createClient } from "@supabase/supabase-js";

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const bot = new Bot(mustGetEnv("BOT_TOKEN"));
const supabase = createClient(
  mustGetEnv("SUPABASE_URL"),
  mustGetEnv("SUPABASE_SERVICE_ROLE_KEY")
);

const REMINDER_TEXT = "Reminder: Please clock out of SRT by 2100hrs.";

export default async function handler(req, res) {
  try {
    const { data: sessions, error } = await supabase
      .from("srt_sessions")
      .select("id, telegram_user_id")
      .is("clock_out_at", null)
      .is("reminded_at", null);

    if (error) throw error;

    for (const s of sessions ?? []) {
      // remind troopers (not commanders)
      const { data: u, error: uErr } = await supabase
        .from("users")
        .select("role")
        .eq("telegram_user_id", s.telegram_user_id)
        .maybeSingle();

      if (uErr) throw uErr;

      if (u?.role === "trooper") {
        try {
          await bot.api.sendMessage(s.telegram_user_id, REMINDER_TEXT);
        } catch {}
      }

      // Mark reminded regardless, so we don't keep scanning this session forever
      await supabase
        .from("srt_sessions")
        .update({ reminded_at: new Date().toISOString() })
        .eq("id", s.id);
    }

    return res.status(200).json({ ok: true, reminded_sessions: (sessions ?? []).length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
}
