import { Bot, webhookCallback, Keyboard, InlineKeyboard } from "grammy";
import {
  getUser,
  registerTrooperOnce,
  updateUserInfo,
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

  // ✅ NEW: choose role first
  REG_ROLE_PICK: "Registration:\n\nAre you registering as a TROOPER or COMMANDER?",
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
  INVALID_COMPANY: "Invalid company.",
  START_AGAIN: "Please start again.",

  EDIT_ONLY_TC: "Edit is only for trooper/commander.",
  EDIT_STEP1_FULLNAME: "Edit 1/3: Send your FULL NAME (one message).",
  EDIT_DONE: "Updated ✅",

  SRT_ONLY_TC: "Clock In is only for trooper/commander.",
  SRT_IN_MENU: "You are CLOCKED IN.\nChoose:",
  SRT_OUT_MENU: "You are CLOCKED OUT.\nChoose:",
  SRT_ALREADY_IN: "Already clocked in.",
  SRT_NOT_IN: "You are not clocked in.",
  SRT_CLOCKOUT_DONE: "⏱ Clocked OUT ✅",

  LOCATION_PROMPT: 'Location of SFT:\nSend the location in ONE message (e.g. "Temasek Parade Square").',
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

const BTN = { REGISTER: "📝 Register", EDIT_INFO: "🛠 Edit Info", SRT_CLOCK: "⏱ Clock In/Out" };

/* ================= KEYBOARDS ================= */

function registerKeyboard() {
  return new Keyboard().text(BTN.REGISTER).resized();
}
function memberMenuKeyboard() {
  return new Keyboard().text(BTN.EDIT_INFO).text(BTN.SRT_CLOCK).resized();
}

function rolePickKb() {
  return new InlineKeyboard()
    .text("👤 Trooper", "reg_role:trooper")
    .row()
    .text("⭐ Commander", "reg_role:commander")
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
  return new InlineKeyboard().text("✅ Confirm", `reg_confirm:${mode}`).text("❌ Cancel", "reg_cancel");
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

/* ================= HELPERS ================= */

function welcomeBack(u) {
  return (
    `Welcome back, ${u.full_name} ✅\n` +
    `Role: ${u.role.toUpperCase()}\n` +
    `Company: ${u.company}\n` +
    `Platoon: ${u.platoon}`
  );
}
function isTrooperOrCommander(u) {
  return u?.role === "trooper" || u?.role === "commander";
}
function buildConfirmText(pending, chosenSubunit) {
  const cfg = COMPANY_CONFIG[pending.company];
  const extra = safeParseExtra(pending.extra);
  const role = (extra?.desired_role ?? "trooper").toString().toUpperCase();

  return (
    TXT.REG_CONFIRM_PREFIX +
    `${TXT.REG_CONFIRM_LABEL_FULLNAME}: ${pending.full_name}\n` +
    `${TXT.REG_CONFIRM_LABEL_ROLE}: ${role}\n` +
    `${TXT.REG_CONFIRM_LABEL_COMPANY}: ${pending.company}\n` +
    `${cfg.label}: ${chosenSubunit}`
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

/* ================= /start ================= */

bot.command("start", async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) return ctx.reply(TXT.NOT_REGISTERED_PROMPT, { reply_markup: registerKeyboard() });

  await updateUsernameIfExists(ctx.from.id, ctx.from.username ?? null);
  if (isTrooperOrCommander(user)) return ctx.reply(welcomeBack(user), { reply_markup: memberMenuKeyboard() });
  return ctx.reply(welcomeBack(user));
});

/* ================= REGISTER ================= */

bot.hears(BTN.REGISTER, async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (user) {
    await updateUsernameIfExists(ctx.from.id, ctx.from.username ?? null);
    if (isTrooperOrCommander(user)) return ctx.reply(welcomeBack(user), { reply_markup: memberMenuKeyboard() });
    return ctx.reply(welcomeBack(user));
  }

  // start pending, but now ask ROLE first
  await startPending({
    telegram_user_id: ctx.from.id,
    username: ctx.from.username ?? null,
    mode: "register",
  });

  await setPendingStep(ctx.from.id, { step: "choose_role" });
  return ctx.reply(TXT.REG_ROLE_PICK, { reply_markup: rolePickKb() });
});

/* ================= EDIT INFO ================= */

bot.hears(BTN.EDIT_INFO, async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) return ctx.reply(TXT.NOT_REGISTERED_PROMPT, { reply_markup: registerKeyboard() });
  if (!isTrooperOrCommander(user)) return ctx.reply(TXT.EDIT_ONLY_TC);

  await startPending({
    telegram_user_id: ctx.from.id,
    username: ctx.from.username ?? null,
    mode: "edit",
  });

  return ctx.reply(TXT.EDIT_STEP1_FULLNAME);
});

/* ================= SRT MENU ================= */

bot.hears(BTN.SRT_CLOCK, async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) return ctx.reply(TXT.NOT_REGISTERED_PROMPT, { reply_markup: registerKeyboard() });
  if (!isTrooperOrCommander(user)) return ctx.reply(TXT.SRT_ONLY_TC);

  const open = await getOpenSrtSession(ctx.from.id);
  return ctx.reply(open ? TXT.SRT_IN_MENU : TXT.SRT_OUT_MENU, { reply_markup: srtInlineKb(!!open) });
});

/* ================= TEXT HANDLER ================= */

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();
  const user = await getUser(ctx.from.id);
  const pendingForUser = await getPending(ctx.from.id);

  // clock-in awaiting location
  if (user && pendingForUser?.mode === "clockin" && pendingForUser.step === "await_location") {
    const extra = safeParseExtra(pendingForUser.extra);
    extra.location_of_sft = text;
    await setPendingStep(ctx.from.id, { step: "medical_q9", extra: stringifyExtra(extra) });
    return ctx.reply(TXT.MED_Q9, { reply_markup: yesNoInlineKb("med_q9_yes", "med_q9_no") });
  }

  // ✅ commander passcode text step
  if (!user && pendingForUser?.mode === "register" && pendingForUser.step === "await_comd_pass") {
    const pass = text;
    const extra = safeParseExtra(pendingForUser.extra);

    if (!COMD_PASS) {
      await deletePending(ctx.from.id);
      return ctx.reply(TXT.REG_COMD_DISABLED, { reply_markup: registerKeyboard() });
    }

    if (pass !== COMD_PASS) {
      // stop registration (must restart and choose trooper)
      await deletePending(ctx.from.id);
      return ctx.reply(TXT.REG_COMD_BAD, { reply_markup: registerKeyboard() });
    }

    // pass ok -> proceed to full name
    extra.desired_role = "commander";
    await setPendingStep(ctx.from.id, { step: "await_full_name", extra: stringifyExtra(extra) });
    await ctx.reply(TXT.REG_COMD_OK);
    return ctx.reply(TXT.REG_STEP1_FULLNAME);
  }

  // registered -> chatbot
  if (user) {
    await updateUsernameIfExists(ctx.from.id, ctx.from.username ?? null);
    return ctx.reply(generateReply(text));
  }

  // unregistered register/edit flow
  const pending = pendingForUser;
  if (!pending) return ctx.reply(TXT.REG_TIMEOUT, { reply_markup: registerKeyboard() });

  if (pending.mode === "edit") {
    if (pending.step !== "await_full_name") return ctx.reply(TXT.PLEASE_USE_BUTTONS);
    await setPendingStep(ctx.from.id, { full_name: text, step: "choose_company" });
    return ctx.reply(TXT.REG_STEP2_COMPANY, { reply_markup: companyInlineKb() });
  }

  if (pending.mode === "register") {
    // after role picked + verified, we ask full name
    if (pending.step !== "await_full_name") return ctx.reply(TXT.PLEASE_USE_BUTTONS);

    await setPendingStep(ctx.from.id, { full_name: text, step: "choose_company" });
    return ctx.reply(TXT.REG_STEP2_COMPANY, { reply_markup: companyInlineKb() });
  }

  return ctx.reply(TXT.PLEASE_USE_BUTTONS);
});

/* ================= REGISTER CALLBACKS ================= */

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

  // commander chosen -> ask passcode BEFORE other questions
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
  return ctx.reply(`Step 3/3: Select your ${label}:`, { reply_markup: subunitInlineKb(company) });
});

bot.callbackQuery(/^reg_subunit:(.+)$/i, async (ctx) => {
  await clearButtons(ctx);

  const platoon = ctx.match[1];
  const pending = await getPending(ctx.from.id);

  if (!pending || pending.step !== "choose_subunit") {
    await ctx.answerCallbackQuery({ text: TXT.START_AGAIN });
    return;
  }

  await setPendingStep(ctx.from.id, { platoon, step: "confirm" });
  await ctx.answerCallbackQuery();

  // use updated pending (get again to include new platoon)
  const pendingUpdated = await getPending(ctx.from.id);
  return ctx.reply(buildConfirmText(pendingUpdated, platoon), { reply_markup: confirmInlineKb("register") });
});

bot.callbackQuery(/^reg_confirm:register$/i, async (ctx) => {
  await clearButtons(ctx);

  const pending = await getPending(ctx.from.id);
  if (!pending || pending.step !== "confirm" || pending.mode !== "register") {
    await ctx.answerCallbackQuery({ text: TXT.START_AGAIN });
    return;
  }

  const extra = safeParseExtra(pending.extra);
  const desiredRole = extra?.desired_role === "commander" ? "commander" : "trooper";

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

  const user = await getUser(ctx.from.id);
  if (user && isTrooperOrCommander(user)) return ctx.reply(TXT.REG_DONE, { reply_markup: memberMenuKeyboard() });
  return ctx.reply(TXT.REG_DONE);
});

bot.callbackQuery("reg_cancel", async (ctx) => {
  await clearButtons(ctx);
  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery({ text: TXT.CANCELLED });

  const user = await getUser(ctx.from.id);
  if (user && isTrooperOrCommander(user)) return ctx.reply(TXT.CANCELLED, { reply_markup: memberMenuKeyboard() });
  if (user) return ctx.reply(TXT.CANCELLED);
  return ctx.reply(TXT.REG_CANCELLED_PROMPT, { reply_markup: registerKeyboard() });
});

/* ================= EDIT CALLBACKS ================= */

bot.callbackQuery(/^reg_confirm:edit$/i, async (ctx) => {
  await clearButtons(ctx);

  const pending = await getPending(ctx.from.id);
  if (!pending || pending.step !== "confirm" || pending.mode !== "edit") {
    await ctx.answerCallbackQuery({ text: TXT.START_AGAIN });
    return;
  }

  await updateUserInfo({
    telegram_user_id: pending.telegram_user_id,
    username: pending.username,
    full_name: pending.full_name,
    company: pending.company,
    platoon: pending.platoon,
  });

  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery();

  const user = await getUser(ctx.from.id);
  if (user && isTrooperOrCommander(user)) return ctx.reply(TXT.EDIT_DONE, { reply_markup: memberMenuKeyboard() });
  return ctx.reply(TXT.EDIT_DONE);
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
  return ctx.reply(TXT.LOCATION_PROMPT);
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
  return ctx.reply(TXT.NOT_OK_MESSAGE, { reply_markup: memberMenuKeyboard() });
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

  await srtClockIn({
    telegram_user_id: ctx.from.id,
    role: user.role,
    wellness_ok: true,
    location_of_sft: extra.location_of_sft ?? null,
    medical_q9_any_apply: false,
    pre_activity_q10_confirmed: true,
  });

  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery();
  return ctx.reply(TXT.CLOCKIN_DONE, { reply_markup: memberMenuKeyboard() });
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

  return ctx.reply(TXT.SRT_CLOCKOUT_DONE, { reply_markup: memberMenuKeyboard() });
});

bot.callbackQuery("srt_cancel", async (ctx) => {
  await clearButtons(ctx);

  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery({ text: TXT.CANCELLED });
  return ctx.reply(TXT.CANCELLED, { reply_markup: memberMenuKeyboard() });
});

/* ================= VERCEL HANDLER ================= */

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  return webhookCallback(bot, "http")(req, res);
}
