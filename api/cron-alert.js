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

// Singapore = UTC+8, but we'll do the check using UTC cron schedule anyway.
// Still keeping a safety check so alerts don't fire if misconfigured.
function isPast2100Sg() {
  const now = new Date();
  const sgMs = now.getTime() + 8 * 60 * 60 * 1000;
  const sg = new Date(sgMs);
  const h = sg.getUTCHours();
  const m = sg.getUTCMinutes();
  return h > 21 || (h === 21 && m >= 0);
}

export default async function handler(req, res) {
  try {
    if (!isPast2100Sg()) {
      return res.status(200).json({ ok: true, skipped: "before_2100_sg" });
    }

    // All open sessions
    const { data: sessions, error } = await supabase
      .from("srt_sessions")
      .select("id, telegram_user_id, clock_in_at")
      .is("clock_out_at", null);

    if (error) throw error;

    let alertedTroopers = 0;

    for (const s of sessions ?? []) {
      // Fetch trooper data
      const { data: trooper, error: tErr } = await supabase
        .from("users")
        .select("telegram_user_id, full_name, role, company, platoon")
        .eq("telegram_user_id", s.telegram_user_id)
        .maybeSingle();

      if (tErr) throw tErr;
      if (!trooper) continue;

      // Alert only for troopers
      if (trooper.role !== "trooper") continue;

      // Find commanders same company + same platoon ONLY
      const { data: commanders, error: cErr } = await supabase
        .from("users")
        .select("telegram_user_id")
        .eq("role", "commander")
        .eq("company", trooper.company)
        .eq("platoon", trooper.platoon);

      if (cErr) throw cErr;

      const alertText =
        `ALERT: ${trooper.full_name} (${trooper.company} / ${trooper.platoon}) ` +
        `has not clocked out of SRT past 2100hrs.`;

      for (const c of commanders ?? []) {
        try {
          await bot.api.sendMessage(c.telegram_user_id, alertText);
        } catch {}
      }

      alertedTroopers += 1;
    }

    return res.status(200).json({
      ok: true,
      open_sessions: (sessions ?? []).length,
      alerted_troopers: alertedTroopers,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
}
