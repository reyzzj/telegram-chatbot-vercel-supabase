import { Bot, webhookCallback, Keyboard, InlineKeyboard } from "grammy";
import {
  getUser,
  registerTrooperOnce,
  updateUsernameIfExists,
  getOpenSrtSession,
  srtClockIn,
  srtClockOut,
} from "../src/users.js";
import { supabase } from "../src/supabase.js";
import {
  getPending,
  startPending,
  startClockInPending,
  setPendingStep,
  deletePending,
  safeParseExtra,
  stringifyExtra,
} from "../src/pending.js";
import { generateReply } from "../src/chatbot.js";

/* ================= ENV ================= */

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const bot = new Bot(mustGetEnv("BOT_TOKEN"));
const COMD_PASS = process.env.COMD_PASS ?? "";
// Optional (recommended): used to call your Supabase Edge Function if JWT verification is enabled.
// Set this in Vercel env as SUPABASE_ANON_KEY.
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";

// Your Edge Function URL (you can also set EDGE_FUNCTION_URL in Vercel env)
const EDGE_FUNCTION_URL =
  process.env.EDGE_FUNCTION_URL ??
  "https://rhffghvpgqjvtcnevzms.supabase.co/functions/v1/smart-api";

/* ================= CONFIG ================= */

const COMPANY_CONFIG = {
  Alpha: { label: "Platoon", options: ["1", "2", "3", "4", "5", "Coy HQ"] },
  Bravo: { label: "Platoon", options: ["1", "2", "3", "4", "5", "Coy HQ"] },
  Charlie: { label: "Platoon", options: ["1", "2", "3", "4", "5", "Coy HQ"] },
  Support: { label: "Support", options: ["MPAT", "Scout", "Pioneer", "Signals", "Mortar"] },
  HQ: { label: "HQ", options: ["Medics", "SSP", "S1", "S2", "S3", "S4"] },
};
const COMPANIES = Object.keys(COMPANY_CONFIG);

/* ================= TEXT ================= */

const TXT = {
  PLEASE_USE_BUTTONS: "Please use the buttons.",
  CANCELLED: "Cancelled.",
  NOT_REGISTERED_PROMPT: "You are not registered yet.\nPress 📝 Register to begin.",
  REG_TIMEOUT: "Registration timed out.\nPress 📝 Register to begin again.",
  START_AGAIN: "Please start again.",
  INVALID_COMPANY: "Invalid company.",

  // Register flow
  REG_ROLE_PICK: "Registration:\n\nAre you registering as a TROOPER or COMMANDER?",
  REG_DOS_DONTS:
    "Before you register, please read:\n\n" +
    "✅ Do:\n" +
    "• Use your real FULL NAME\n" +
    "• Select the correct Company/Platoon\n" +
    "• /start the bot on BOTH trooper & commander accounts (Telegram blocks messages otherwise)\n\n" +
    "❌ Don't:\n" +
    "• Share the commander passcode\n" +
    "• Clock in if unwell / any medical items apply\n" +
    "• Spam the bot (use the buttons)\n",
  REG_COMD_PASS_PROMPT: "Commander registration:\n\nPlease enter the commander passcode:",
  REG_COMD_OK: "Commander code accepted ✅ Proceeding with COMMANDER registration.",
  REG_COMD_BAD:
    "Commander code incorrect ⚠️ You cannot register as COMMANDER.\nPlease register as TROOPER instead.",
  REG_COMD_DISABLED:
    "Commander registration is not enabled (COMD_PASS not set).\nPlease register as TROOPER instead.",
  REG_STEP1_FULLNAME: "Step 1/3: Send your FULL NAME (one message).",
  REG_STEP2_COMPANY: "Step 2/3: Select your COMPANY:",
  REG_CONFIRM_PREFIX: "Confirm your details:\n\n",
  REG_CONFIRM_LABEL_FULLNAME: "Full Name",
  REG_CONFIRM_LABEL_COMPANY: "Company",
  REG_CONFIRM_LABEL_ROLE: "Role",
  REG_DONE: "Registered ✅",
  REG_CANCELLED_PROMPT: "Cancelled.\nPress 📝 Register to start again.",

  // Edit flow
  EDIT_ONLY_TC: "Edit is only for trooper/commander.",
  EDIT_STEP1_FULLNAME: "Edit 1/4: Send your FULL NAME (one message).",
  EDIT_STEP2_COMPANY: "Edit 2/4: Select your COMPANY:",
  EDIT_STEP3_PLATOON: "Edit 3/4: Select your Platoon:",
  EDIT_STEP4_ROLE: "Edit 4/4: Select your ROLE:",
  EDIT_COMD_PASS_PROMPT:
    "To change to COMMANDER, please enter the commander passcode:",
  EDIT_COMD_OK: "Commander code accepted ✅ Role will be set to COMMANDER.",
  EDIT_COMD_BAD:
    "Commander code incorrect ⚠️ Role will remain as TROOPER.",
  EDIT_COMD_DISABLED:
    "Commander registration is not enabled (COMD_PASS not set).\nRole will remain as TROOPER.",
  EDIT_DONE: "Updated ✅",

  // Clock In menu
  SRT_ONLY_TC: "Clock In is only for trooper/commander.",
  SRT_IN_MENU: "You are CLOCKED IN.\nChoose:",
  SRT_OUT_MENU: "You are CLOCKED OUT.\nChoose:",
  SRT_ALREADY_IN: "Already clocked in.",
  SRT_NOT_IN: "You are not clocked in.",
  SRT_CLOCKOUT_CONFIRM: "Confirm clock out?",
  SRT_CLOCKOUT_DONE: "⏱ Clocked OUT ✅",

  // location + medical + checklist
  LOCATION_PROMPT: "Location of SFT:\nSelect one option:",
  LOCATION_OTHER_PROMPT: "Send the location in ONE message (e.g. \"Bedok Camp Track\").",
  MED_Q9:
    "Q9) Medical Questions.\nDo you have any of the following?\n\n" +
    "a. Diagnosis or treatment for heart disease or stroke, or chest pain/pressure during activity\n" +
    "b. High blood pressure diagnosis, or resting BP ≥160/90 mmHg\n" +
    "c. Dizziness or lightheadedness during physical activity\n" +
    "d. Shortness of breath at rest\n" +
    "e. Loss of consciousness/fainting (for any reason)\n" +
    "f. History of concussion\n\n" +
    "Do any of the above apply to you?",
  PRECHECK_Q10:
    "Q10) Pre-activity checklist:\n" +
    "a. I have drank beyond the point of thirst.\n" +
    "b. I am free from the past/present medical conditions and status.\n" +
    "c. If I am asthmatic, I have my inhaler with me.\n" +
    "d. I have at least 7 hrs of uninterrupted rest.\n" +
    "e. My body temperature is under 37.5°C.\n\n" +
    "Confirm ALL met? (You can only clock in if all are met.)",
  CLOCKIN_DONE: "✅ Clocked IN ✅",
  NOT_OK_MESSAGE:
    "Please do not clock in if you are not feeling well or do not meet the necessary conditions to participate.",

  NOT_ALLOWED: "Not allowed.",
  PRESS_CLOCKIN_AGAIN: "Please press Clock In again.",
};

/* ================= BUTTON LABELS ================= */

const BTN = {
  REGISTER: "📝 Register",
  EDIT_INFO: "🛠 Edit Info",
  SRT_CLOCK_IN: "⏱ Clock In",
  SRT_CLOCK_OUT: "⏱ Clock Out",
};

/* ================= KEYBOARDS ================= */

function registerKeyboard() {
  return new Keyboard().text(BTN.REGISTER).resized();
}
function memberMenuKeyboard(openSessionExists) {
  const clockBtn = openSessionExists ? BTN.SRT_CLOCK_OUT : BTN.SRT_CLOCK_IN;
  return new Keyboard().text(BTN.EDIT_INFO).text(clockBtn).resized();
}

function rolePickKb(cbPrefix) {
  return new InlineKeyboard()
    .text("👤 Trooper", `${cbPrefix}:trooper`)
    .row()
    .text("⭐ Commander", `${cbPrefix}:commander`)
    .row()
    .text("❌ Cancel", "reg_cancel");
}

function companyInlineKb() {
  const kb = new InlineKeyboard();
  for (const c of COMPANIES) kb.text(c, `reg_company:${c}`).row();
  kb.text("❌ Cancel", "reg_cancel");
  return kb;
}

function subunitInlineKb(company) {
  const kb = new InlineKeyboard();
  for (const opt of COMPANY_CONFIG[company].options) kb.text(opt, `reg_subunit:${opt}`).row();
  kb.text("❌ Cancel", "reg_cancel");
  return kb;
}

function confirmInlineKb(mode) {
  return new InlineKeyboard()
    .text("✅ Confirm", `reg_confirm:${mode}`)
    .text("❌ Cancel", "reg_cancel");
}

function srtInlineKb(openSessionExists) {
  const kb = new InlineKeyboard();
  if (openSessionExists) kb.text("⏱ Clock Out", "srt_clockout");
  else kb.text("⏱ Clock In", "srt_clockin");
  kb.text("❌ Cancel", "srt_cancel");
  return kb;
}

function yesNoInlineKb(yesCb, noCb) {
  return new InlineKeyboard().text("✅ No", noCb).text("⚠️ Yes", yesCb);
}

function confirmCancelInlineKb(confirmCb) {
  return new InlineKeyboard().text("✅ Confirm", confirmCb).text("❌ Cancel", "srt_cancel");
}

function locationInlineKb() {
  return new InlineKeyboard()
    .text("Temasek Square", "loc_pick:Temasek Square").row()
    .text("RTS", "loc_pick:RTS").row()
    .text("Coyline", "loc_pick:Coyline").row()
    .text("Gym", "loc_pick:Gym").row()
    .text("MPH", "loc_pick:MPH").row()
    .text("Others", "loc_other").row()
    .text("❌ Cancel", "srt_cancel");
}

/* ================= HELPERS ================= */

function isTrooperOrCommander(u) {
  return u?.role === "trooper" || u?.role === "commander";
}

function welcomeBack(u) {
  return (
    `Welcome back, ${u.full_name} ✅\n` +
    `Role: ${u.role.toUpperCase()}\n` +
    `Company: ${u.company}\n` +
    `Platoon: ${u.platoon}`
  );
}

async function replyWithMemberMenu(ctx, text) {
  const open = await getOpenSrtSession(ctx.from.id);
  return ctx.reply(text, { reply_markup: memberMenuKeyboard(!!open) });
}

function buildConfirmText(pending) {
  const cfg = COMPANY_CONFIG[pending.company];
  const extra = safeParseExtra(pending.extra);
  const role = (extra?.desired_role ?? "trooper").toString().toUpperCase();
  return (
    TXT.REG_CONFIRM_PREFIX +
    `${TXT.REG_CONFIRM_LABEL_FULLNAME}: ${pending.full_name}\n` +
    `${TXT.REG_CONFIRM_LABEL_ROLE}: ${role}\n` +
    `${TXT.REG_CONFIRM_LABEL_COMPANY}: ${pending.company}\n` +
    `${cfg.label}: ${pending.platoon}`
  );
}

async function clearButtons(ctx) {
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: null });
  } catch {}
}

async function registerUserOnce({ telegram_user_id, username, full_name, company, platoon, role }) {
  if ((role ?? "trooper") === "trooper") {
    return registerTrooperOnce({ telegram_user_id, username, full_name, company, platoon });
  }
  const { error } = await supabase.from("users").insert({
    telegram_user_id,
    username: username ?? null,
    full_name,
    role: "commander",
    company,
    platoon,
  });
  if (error) throw error;
}

async function updateUserAll({ telegram_user_id, full_name, company, platoon, role, username }) {
  const payload = { full_name, company, platoon, role };
  if (username !== undefined) payload.username = username;

  const { error } = await supabase
    .from("users")
    .update(payload)
    .eq("telegram_user_id", telegram_user_id);

  if (error) throw error;
}

/* ================= NEW: Notify commanders on clock-in ================= */

async function notifyCommandersClockIn({ telegram_user_id, session_id }) {
  try {
    const headers = { "Content-Type": "application/json" };
    // If your Edge Function has JWT verification enabled, you MUST provide a valid key.
    // Using the anon key here is safe (it only authorizes the request to hit the function).
    if (SUPABASE_ANON_KEY) {
      headers.apikey = SUPABASE_ANON_KEY;
      headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
    }

    const r = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        mode: "clockin_notify",
        telegram_user_id,
        ...(session_id ? { session_id } : {}),
      }),
    });

    // Log response for debugging
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.log("[clockin_notify] FAILED", r.status, t.slice(0, 300));
    } else {
      const j = await r.json().catch(() => ({}));
      console.log("[clockin_notify] OK", j);
    }
  } catch (e) {
    console.log("[clockin_notify] ERROR", String(e));
  }
}

/* ================= /start ================= */

bot.command("start", async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) return ctx.reply(TXT.NOT_REGISTERED_PROMPT, { reply_markup: registerKeyboard() });

  await updateUsernameIfExists(ctx.from.id, ctx.from.username ?? null);

  if (isTrooperOrCommander(user)) {
    return replyWithMemberMenu(ctx, welcomeBack(user));
  }
  return ctx.reply(welcomeBack(user));
});

/* ================= REGISTER ================= */

bot.hears(BTN.REGISTER, async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (user) {
    await updateUsernameIfExists(ctx.from.id, ctx.from.username ?? null);
    if (isTrooperOrCommander(user)) return replyWithMemberMenu(ctx, welcomeBack(user));
    return ctx.reply(welcomeBack(user));
  }

  await startPending({
    telegram_user_id: ctx.from.id,
    username: ctx.from.username ?? null,
    mode: "register",
  });

  await setPendingStep(ctx.from.id, { step: "choose_role" });
  await ctx.reply(TXT.REG_DOS_DONTS);
  return ctx.reply(TXT.REG_ROLE_PICK, { reply_markup: rolePickKb("reg_role") });
});

/* ================= EDIT ================= */

bot.hears(BTN.EDIT_INFO, async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) return ctx.reply(TXT.NOT_REGISTERED_PROMPT, { reply_markup: registerKeyboard() });
  if (!isTrooperOrCommander(user)) return ctx.reply(TXT.EDIT_ONLY_TC);

  const extra = {
    current_role: user.role,
    desired_role: user.role,
  };

  await startPending({
    telegram_user_id: ctx.from.id,
    username: ctx.from.username ?? null,
    mode: "edit",
  });

  await setPendingStep(ctx.from.id, {
    step: "await_full_name",
    full_name: user.full_name,
    company: user.company,
    platoon: user.platoon,
    extra: stringifyExtra(extra),
  });

  return ctx.reply(TXT.EDIT_STEP1_FULLNAME);
});

/* ================= SRT MENU ================= */

bot.hears(BTN.SRT_CLOCK_IN, async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) return ctx.reply(TXT.NOT_REGISTERED_PROMPT, { reply_markup: registerKeyboard() });
  if (!isTrooperOrCommander(user)) return ctx.reply(TXT.SRT_ONLY_TC);

  const open = await getOpenSrtSession(ctx.from.id);
  if (open) return replyWithMemberMenu(ctx, TXT.SRT_ALREADY_IN);

  await startClockInPending({
    telegram_user_id: ctx.from.id,
    username: ctx.from.username ?? null,
  });

  // Location selection as buttons
  return ctx.reply(TXT.LOCATION_PROMPT, { reply_markup: locationInlineKb() });
});

bot.hears(BTN.SRT_CLOCK_OUT, async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) return ctx.reply(TXT.NOT_REGISTERED_PROMPT, { reply_markup: registerKeyboard() });
  if (!isTrooperOrCommander(user)) return ctx.reply(TXT.SRT_ONLY_TC);

  const open = await getOpenSrtSession(ctx.from.id);
  if (!open) return replyWithMemberMenu(ctx, TXT.SRT_NOT_IN);

  // Confirm to prevent accidental clock-out
  return ctx.reply(TXT.SRT_CLOCKOUT_CONFIRM, { reply_markup: confirmCancelInlineKb("clockout_confirm") });
});

/* ================= TEXT HANDLER ================= */

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();
  const user = await getUser(ctx.from.id);
  const pending = await getPending(ctx.from.id);

  // ========== CLOCK-IN: awaiting "Others" location text ==========
  if (user && pending?.mode === "clockin" && pending.step === "await_location_text") {
    const extra = safeParseExtra(pending.extra);
    extra.location_of_sft = text;

    await setPendingStep(ctx.from.id, { step: "medical_q9", extra: stringifyExtra(extra) });
    return ctx.reply(TXT.MED_Q9, { reply_markup: yesNoInlineKb("med_q9_yes", "med_q9_no") });
  }

  // ========== REGISTER: awaiting commander pass ==========
  if (!user && pending?.mode === "register" && pending.step === "await_comd_pass") {
    if (!COMD_PASS) {
      await deletePending(ctx.from.id);
      return ctx.reply(TXT.REG_COMD_DISABLED, { reply_markup: registerKeyboard() });
    }

    if (text !== COMD_PASS) {
      await deletePending(ctx.from.id);
      return ctx.reply(TXT.REG_COMD_BAD, { reply_markup: registerKeyboard() });
    }

    const extra = safeParseExtra(pending.extra);
    extra.desired_role = "commander";
    await setPendingStep(ctx.from.id, { step: "await_full_name", extra: stringifyExtra(extra) });
    await ctx.reply(TXT.REG_COMD_OK);
    return ctx.reply(TXT.REG_STEP1_FULLNAME);
  }

  // ========== EDIT: awaiting commander pass ==========
  if (user && pending?.mode === "edit" && pending.step === "await_edit_comd_pass") {
    const extra = safeParseExtra(pending.extra);

    if (!COMD_PASS) {
      extra.desired_role = "trooper";
      await setPendingStep(ctx.from.id, { step: "confirm", extra: stringifyExtra(extra) });
      await ctx.reply(TXT.EDIT_COMD_DISABLED);
      const pendingUpdated = await getPending(ctx.from.id);
      return ctx.reply(buildConfirmText(pendingUpdated), { reply_markup: confirmInlineKb("edit") });
    }

    if (text !== COMD_PASS) {
      extra.desired_role = "trooper";
      await setPendingStep(ctx.from.id, { step: "confirm", extra: stringifyExtra(extra) });
      await ctx.reply(TXT.EDIT_COMD_BAD);
      const pendingUpdated = await getPending(ctx.from.id);
      return ctx.reply(buildConfirmText(pendingUpdated), { reply_markup: confirmInlineKb("edit") });
    }

    extra.desired_role = "commander";
    await setPendingStep(ctx.from.id, { step: "confirm", extra: stringifyExtra(extra) });
    await ctx.reply(TXT.EDIT_COMD_OK);
    const pendingUpdated = await getPending(ctx.from.id);
    return ctx.reply(buildConfirmText(pendingUpdated), { reply_markup: confirmInlineKb("edit") });
  }

  // ========== Registered user normal messages ==========
  if (user) {
    if (pending?.mode === "edit") {
      if (pending.step === "await_full_name") {
        await setPendingStep(ctx.from.id, { full_name: text, step: "choose_company" });
        return ctx.reply(TXT.EDIT_STEP2_COMPANY, { reply_markup: companyInlineKb() });
      }
      return ctx.reply(TXT.PLEASE_USE_BUTTONS);
    }

    await updateUsernameIfExists(ctx.from.id, ctx.from.username ?? null);
    return ctx.reply(generateReply(text));
  }

  // ========== Unregistered: register flow name input ==========
  if (!pending) return ctx.reply(TXT.REG_TIMEOUT, { reply_markup: registerKeyboard() });

  if (pending.mode === "register") {
    if (pending.step !== "await_full_name") return ctx.reply(TXT.PLEASE_USE_BUTTONS);

    await setPendingStep(ctx.from.id, { full_name: text, step: "choose_company" });
    return ctx.reply(TXT.REG_STEP2_COMPANY, { reply_markup: companyInlineKb() });
  }

  return ctx.reply(TXT.PLEASE_USE_BUTTONS);
});

/* ================= REGISTER ROLE PICK ================= */

bot.callbackQuery(/^reg_role:(trooper|commander)$/i, async (ctx) => {
  await clearButtons(ctx);

  const chosen = ctx.match[1];
  const pending = await getPending(ctx.from.id);

  if (!pending || pending.mode !== "register" || pending.step !== "choose_role") {
    await ctx.answerCallbackQuery({ text: TXT.START_AGAIN });
    return;
  }

  const extra = safeParseExtra(pending.extra);

  if (chosen === "trooper") {
    extra.desired_role = "trooper";
    await setPendingStep(ctx.from.id, { step: "await_full_name", extra: stringifyExtra(extra) });
    await ctx.answerCallbackQuery();
    return ctx.reply(TXT.REG_STEP1_FULLNAME);
  }

  if (!COMD_PASS) {
    await deletePending(ctx.from.id);
    await ctx.answerCallbackQuery();
    return ctx.reply(TXT.REG_COMD_DISABLED, { reply_markup: registerKeyboard() });
  }

  extra.desired_role = "commander";
  await setPendingStep(ctx.from.id, { step: "await_comd_pass", extra: stringifyExtra(extra) });
  await ctx.answerCallbackQuery();
  return ctx.reply(TXT.REG_COMD_PASS_PROMPT);
});

/* ================= COMPANY / SUBUNIT ================= */

bot.callbackQuery(/^reg_company:(.+)$/i, async (ctx) => {
  await clearButtons(ctx);

  const company = ctx.match[1];
  const pending = await getPending(ctx.from.id);

  if (!pending || pending.step !== "choose_company") {
    await ctx.answerCallbackQuery({ text: TXT.START_AGAIN });
    return;
  }

  if (!COMPANY_CONFIG[company]) {
    await ctx.answerCallbackQuery({ text: TXT.INVALID_COMPANY });
    return;
  }

  await setPendingStep(ctx.from.id, { company, step: "choose_subunit" });
  await ctx.answerCallbackQuery();

  const label = COMPANY_CONFIG[company].label;
  const prompt = pending.mode === "edit" ? TXT.EDIT_STEP3_PLATOON : `Step 3/3: Select your ${label}:`;
  return ctx.reply(prompt, { reply_markup: subunitInlineKb(company) });
});

bot.callbackQuery(/^reg_subunit:(.+)$/i, async (ctx) => {
  await clearButtons(ctx);

  const platoon = ctx.match[1];
  const pending = await getPending(ctx.from.id);

  if (!pending || pending.step !== "choose_subunit") {
    await ctx.answerCallbackQuery({ text: TXT.START_AGAIN });
    return;
  }

  await setPendingStep(ctx.from.id, { platoon });
  await ctx.answerCallbackQuery();

  if (pending.mode === "register") {
    await setPendingStep(ctx.from.id, { step: "confirm" });
    const pendingUpdated = await getPending(ctx.from.id);
    return ctx.reply(buildConfirmText(pendingUpdated), { reply_markup: confirmInlineKb("register") });
  }

  if (pending.mode === "edit") {
    await setPendingStep(ctx.from.id, { step: "choose_edit_role" });
    return ctx.reply(TXT.EDIT_STEP4_ROLE, { reply_markup: rolePickKb("edit_role") });
  }

  return ctx.reply(TXT.PLEASE_USE_BUTTONS);
});

/* ================= EDIT ROLE PICK ================= */

bot.callbackQuery(/^edit_role:(trooper|commander)$/i, async (ctx) => {
  await clearButtons(ctx);

  const chosen = ctx.match[1];
  const user = await getUser(ctx.from.id);
  const pending = await getPending(ctx.from.id);

  if (!user || !pending || pending.mode !== "edit" || pending.step !== "choose_edit_role") {
    await ctx.answerCallbackQuery({ text: TXT.START_AGAIN });
    return;
  }

  const extra = safeParseExtra(pending.extra);
  const currentRole = (extra?.current_role ?? user.role ?? "trooper").toString();

  extra.desired_role = chosen;

  if (currentRole === "trooper" && chosen === "commander") {
    if (!COMD_PASS) {
      extra.desired_role = "trooper";
      await setPendingStep(ctx.from.id, { step: "confirm", extra: stringifyExtra(extra) });
      await ctx.answerCallbackQuery();
      await ctx.reply(TXT.EDIT_COMD_DISABLED);
      const pendingUpdated = await getPending(ctx.from.id);
      return ctx.reply(buildConfirmText(pendingUpdated), { reply_markup: confirmInlineKb("edit") });
    }

    await setPendingStep(ctx.from.id, { step: "await_edit_comd_pass", extra: stringifyExtra(extra) });
    await ctx.answerCallbackQuery();
    return ctx.reply(TXT.EDIT_COMD_PASS_PROMPT);
  }

  await setPendingStep(ctx.from.id, { step: "confirm", extra: stringifyExtra(extra) });
  await ctx.answerCallbackQuery();

  const pendingUpdated = await getPending(ctx.from.id);
  return ctx.reply(buildConfirmText(pendingUpdated), { reply_markup: confirmInlineKb("edit") });
});

/* ================= CONFIRM (register/edit) ================= */

bot.callbackQuery(/^reg_confirm:(register|edit)$/i, async (ctx) => {
  await clearButtons(ctx);

  const mode = ctx.match[1];
  const pending = await getPending(ctx.from.id);

  if (!pending || pending.step !== "confirm" || pending.mode !== mode) {
    await ctx.answerCallbackQuery({ text: TXT.START_AGAIN });
    return;
  }

  const extra = safeParseExtra(pending.extra);
  const desiredRole = extra?.desired_role === "commander" ? "commander" : "trooper";

  if (mode === "register") {
    await registerUserOnce({
      telegram_user_id: pending.telegram_user_id,
      username: pending.username,
      full_name: pending.full_name,
      company: pending.company,
      platoon: pending.platoon,
      role: desiredRole,
    });

    await deletePending(ctx.from.id);
    await ctx.answerCallbackQuery();

    const userNow = await getUser(ctx.from.id);
    if (userNow && isTrooperOrCommander(userNow)) return replyWithMemberMenu(ctx, TXT.REG_DONE);
    return ctx.reply(TXT.REG_DONE);
  }

  await updateUserAll({
    telegram_user_id: pending.telegram_user_id,
    full_name: pending.full_name,
    company: pending.company,
    platoon: pending.platoon,
    role: desiredRole,
    username: pending.username ?? null,
  });

  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery();

  const userNow = await getUser(ctx.from.id);
  if (userNow && isTrooperOrCommander(userNow)) return replyWithMemberMenu(ctx, TXT.EDIT_DONE);
  return ctx.reply(TXT.EDIT_DONE);
});

/* ================= CANCEL ================= */

bot.callbackQuery("reg_cancel", async (ctx) => {
  await clearButtons(ctx);

  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery({ text: TXT.CANCELLED });

  const user = await getUser(ctx.from.id);
  if (user && isTrooperOrCommander(user)) return replyWithMemberMenu(ctx, TXT.CANCELLED);
  if (user) return ctx.reply(TXT.CANCELLED);
  return ctx.reply(TXT.REG_CANCELLED_PROMPT, { reply_markup: registerKeyboard() });
});

/* ================= SRT CALLBACKS ================= */

bot.callbackQuery("srt_clockin", async (ctx) => {
  await clearButtons(ctx);

  const user = await getUser(ctx.from.id);
  if (!user || !isTrooperOrCommander(user)) {
    await ctx.answerCallbackQuery({ text: TXT.NOT_ALLOWED });
    return;
  }

  const open = await getOpenSrtSession(ctx.from.id);
  if (open) {
    await ctx.answerCallbackQuery({ text: TXT.SRT_ALREADY_IN });
    return;
  }

  await startClockInPending({
    telegram_user_id: ctx.from.id,
    username: ctx.from.username ?? null,
  });

  await ctx.answerCallbackQuery();
  return ctx.reply(TXT.LOCATION_PROMPT, { reply_markup: locationInlineKb() });
});

// Location buttons
bot.callbackQuery(/^loc_pick:(.+)$/i, async (ctx) => {
  await clearButtons(ctx);

  const loc = ctx.match[1];
  const user = await getUser(ctx.from.id);
  if (!user || !isTrooperOrCommander(user)) {
    await ctx.answerCallbackQuery({ text: TXT.NOT_ALLOWED });
    return;
  }

  const pending = await getPending(ctx.from.id);
  if (!pending || pending.mode !== "clockin" || pending.step !== "await_location") {
    await ctx.answerCallbackQuery({ text: TXT.PRESS_CLOCKIN_AGAIN });
    return;
  }

  const extra = safeParseExtra(pending.extra);
  extra.location_of_sft = loc;

  await setPendingStep(ctx.from.id, { step: "medical_q9", extra: stringifyExtra(extra) });
  await ctx.answerCallbackQuery();
  return ctx.reply(TXT.MED_Q9, { reply_markup: yesNoInlineKb("med_q9_yes", "med_q9_no") });
});

bot.callbackQuery("loc_other", async (ctx) => {
  await clearButtons(ctx);

  const user = await getUser(ctx.from.id);
  if (!user || !isTrooperOrCommander(user)) {
    await ctx.answerCallbackQuery({ text: TXT.NOT_ALLOWED });
    return;
  }

  const pending = await getPending(ctx.from.id);
  if (!pending || pending.mode !== "clockin" || pending.step !== "await_location") {
    await ctx.answerCallbackQuery({ text: TXT.PRESS_CLOCKIN_AGAIN });
    return;
  }

  await setPendingStep(ctx.from.id, { step: "await_location_text" });
  await ctx.answerCallbackQuery();
  return ctx.reply(TXT.LOCATION_OTHER_PROMPT);
});

bot.callbackQuery("med_q9_yes", async (ctx) => {
  await clearButtons(ctx);

  const user = await getUser(ctx.from.id);
  if (!user || !isTrooperOrCommander(user)) {
    await ctx.answerCallbackQuery({ text: TXT.NOT_ALLOWED });
    return;
  }

  const pending = await getPending(ctx.from.id);
  if (!pending || pending.mode !== "clockin" || pending.step !== "medical_q9") {
    await ctx.answerCallbackQuery({ text: TXT.PRESS_CLOCKIN_AGAIN });
    return;
  }

  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery();
  return replyWithMemberMenu(ctx, TXT.NOT_OK_MESSAGE);
});

bot.callbackQuery("med_q9_no", async (ctx) => {
  await clearButtons(ctx);

  const user = await getUser(ctx.from.id);
  if (!user || !isTrooperOrCommander(user)) {
    await ctx.answerCallbackQuery({ text: TXT.NOT_ALLOWED });
    return;
  }

  const pending = await getPending(ctx.from.id);
  if (!pending || pending.mode !== "clockin" || pending.step !== "medical_q9") {
    await ctx.answerCallbackQuery({ text: TXT.PRESS_CLOCKIN_AGAIN });
    return;
  }

  await setPendingStep(ctx.from.id, { step: "precheck_q10" });
  await ctx.answerCallbackQuery();
  return ctx.reply(TXT.PRECHECK_Q10, { reply_markup: confirmCancelInlineKb("precheck_confirm") });
});

bot.callbackQuery("precheck_confirm", async (ctx) => {
  await clearButtons(ctx);

  const user = await getUser(ctx.from.id);
  if (!user || !isTrooperOrCommander(user)) {
    await ctx.answerCallbackQuery({ text: TXT.NOT_ALLOWED });
    return;
  }

  const pending = await getPending(ctx.from.id);
  if (!pending || pending.mode !== "clockin" || pending.step !== "precheck_q10") {
    await ctx.answerCallbackQuery({ text: TXT.PRESS_CLOCKIN_AGAIN });
    return;
  }

  const extra = safeParseExtra(pending.extra);

  // 1) Clock in (DB)
  await srtClockIn({
    telegram_user_id: ctx.from.id,
    role: user.role,
    wellness_ok: true,
    location_of_sft: extra.location_of_sft ?? null,
    medical_q9_any_apply: false,
    pre_activity_q10_confirmed: true,
  });

  // 2) Notify commanders (same company/platoon) immediately
  // Grab the open session id if available (helps debugging on the Edge Function side).
  const openAfter = await getOpenSrtSession(ctx.from.id);
  await notifyCommandersClockIn({ telegram_user_id: ctx.from.id, session_id: openAfter?.id });

  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery();
  return replyWithMemberMenu(ctx, TXT.CLOCKIN_DONE);
});

// Clock out confirm (from main keyboard flow)
bot.callbackQuery("clockout_confirm", async (ctx) => {
  await clearButtons(ctx);

  const user = await getUser(ctx.from.id);
  if (!user || !isTrooperOrCommander(user)) {
    await ctx.answerCallbackQuery({ text: TXT.NOT_ALLOWED });
    return;
  }

  const open = await getOpenSrtSession(ctx.from.id);
  if (!open) {
    await ctx.answerCallbackQuery({ text: TXT.SRT_NOT_IN });
    return;
  }

  await srtClockOut({ telegram_user_id: ctx.from.id });
  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery();
  return replyWithMemberMenu(ctx, TXT.SRT_CLOCKOUT_DONE);
});

bot.callbackQuery("srt_clockout", async (ctx) => {
  await clearButtons(ctx);

  const user = await getUser(ctx.from.id);
  if (!user || !isTrooperOrCommander(user)) {
    await ctx.answerCallbackQuery({ text: TXT.NOT_ALLOWED });
    return;
  }

  const open = await getOpenSrtSession(ctx.from.id);
  if (!open) {
    await ctx.answerCallbackQuery({ text: TXT.SRT_NOT_IN });
    return;
  }

  await srtClockOut({ telegram_user_id: ctx.from.id });
  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery();

  return replyWithMemberMenu(ctx, TXT.SRT_CLOCKOUT_DONE);
});

bot.callbackQuery("srt_cancel", async (ctx) => {
  await clearButtons(ctx);

  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery({ text: TXT.CANCELLED });
  return replyWithMemberMenu(ctx, TXT.CANCELLED);
});

/* ================= VERCEL HANDLER ================= */

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  return webhookCallback(bot, "http")(req, res);
}
