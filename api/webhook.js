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

// Commander passcode (from Vercel env var)
const COMD_PASS = process.env.COMD_PASS ?? "";

/* ================= CONFIG ================= */

// Edit to match your unit
const COMPANY_CONFIG = {
  Alpha: { label: "Platoon", options: ["1", "2", "3", "4", "5", "Coy HQ"] },
  Bravo: { label: "Platoon", options: ["1", "2", "3", "4", "5", "Coy HQ"] },
  Charlie: { label: "Platoon", options: ["1", "2", "3", "4", "5", "Coy HQ"] },
  Support: {
    label: "Support",
    options: ["MPAT", "Scout", "Pioneer", "Signals", "Mortar"],
  },
  HQ: { label: "HQ", options: ["Medics", "SSP", "S1", "S2", "S3", "S4"],
  },
};

const COMPANIES = Object.keys(COMPANY_CONFIG);

/* ================= TEXT CONSTANTS ================= */

const TXT = {
  // generic
  PLEASE_USE_BUTTONS: "Please use the buttons.",
  CANCELLED: "Cancelled.",

  // onboarding / start
  NOT_REGISTERED_PROMPT: "You are not registered yet.\nPress 📝 Register to begin.",
  REG_TIMEOUT: "Registration timed out.\nPress 📝 Register to begin again.",

  // register flow
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

  // ✅ NEW: commander code step
  REG_COMD_CODE_PROMPT:
    "Commander registration:\n\n" +
    "If you are a COMMANDER, send the commander passcode now.\n" +
    'If you are a TROOPER, type "SKIP".',
  REG_COMD_CODE_OK: "Commander code accepted ✅ You will be registered as COMMANDER.",
  REG_COMD_CODE_BAD:
    "Commander code incorrect ⚠️ You will be registered as TROOPER.\n(You can still register normally.)",
  REG_COMD_DISABLED:
    "Commander registration is currently not enabled (COMD_PASS not set). You will be registered as TROOPER.",

  // edit flow
  EDIT_ONLY_TC: "Edit is only for trooper/commander.",
  EDIT_STEP1_FULLNAME: "Edit 1/3: Send your FULL NAME (one message).",
  EDIT_DONE: "Updated ✅",

  // Clock In menu
  SRT_ONLY_TC: "Clock In is only for trooper/commander.",
  SRT_IN_MENU: "You are CLOCKED IN.\nChoose:",
  SRT_OUT_MENU: "You are CLOCKED OUT.\nChoose:",
  SRT_ALREADY_IN: "Already clocked in.",
  SRT_NOT_IN: "You are not clocked in.",
  SRT_CLOCKOUT_DONE: "⏱ Clocked OUT ✅",

  // location + medical + checklist
  LOCATION_PROMPT:
    'Location of SFT:\nSend the location in ONE message (e.g. "Bedok Camp Track").',
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

  // permissions
  NOT_ALLOWED: "Not allowed.",
  PRESS_CLOCKIN_AGAIN: "Please press Clock In again.",
};

/* ================= BUTTON LABELS ================= */

const BTN = {
  REGISTER: "📝 Register",
  EDIT_INFO: "🛠 Edit Info",
  // Rename: “SFT Clock” -> “Clock In”
  SRT_CLOCK: "⏱ Clock In",
};

/* ================= KEYBOARDS ================= */

function registerKeyboard() {
  return new Keyboard().text(BTN.REGISTER).resized();
}

function memberMenuKeyboard() {
  return new Keyboard().text(BTN.EDIT_INFO).text(BTN.SRT_CLOCK).resized();
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

// ✅ NEW: remove buttons after any click
async function clearButtons(ctx) {
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: null });
  } catch {
    // Ignore (message already edited / not editable)
  }
}

// ✅ NEW: register user with role (trooper/commander)
async function registerUserOnce({ telegram_user_id, username, full_name, company, platoon, role }) {
  // keep existing trooper flow for compatibility
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

  if (!user) {
    return ctx.reply(TXT.NOT_REGISTERED_PROMPT, { reply_markup: registerKeyboard() });
  }

  await updateUsernameIfExists(ctx.from.id, ctx.from.username ?? null);

  if (isTrooperOrCommander(user)) {
    return ctx.reply(welcomeBack(user), { reply_markup: memberMenuKeyboard() });
  }

  return ctx.reply(welcomeBack(user));
});

/* ================= REGISTER (unregistered only) ================= */

bot.hears(BTN.REGISTER, async (ctx) => {
  const user = await getUser(ctx.from.id);

  // Already registered -> just show menu/welcome
  if (user) {
    await updateUsernameIfExists(ctx.from.id, ctx.from.username ?? null);
    if (isTrooperOrCommander(user)) {
      return ctx.reply(welcomeBack(user), { reply_markup: memberMenuKeyboard() });
    }
    return ctx.reply(welcomeBack(user));
  }

  await startPending({
    telegram_user_id: ctx.from.id,
    username: ctx.from.username ?? null,
    mode: "register",
  });

  return ctx.reply(TXT.REG_STEP1_FULLNAME);
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

/* ================= SRT CLOCK MENU ================= */

bot.hears(BTN.SRT_CLOCK, async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) return ctx.reply(TXT.NOT_REGISTERED_PROMPT, { reply_markup: registerKeyboard() });
  if (!isTrooperOrCommander(user)) return ctx.reply(TXT.SRT_ONLY_TC);

  const open = await getOpenSrtSession(ctx.from.id);

  return ctx.reply(open ? TXT.SRT_IN_MENU : TXT.SRT_OUT_MENU, {
    reply_markup: srtInlineKb(!!open),
  });
});

/* ================= TEXT HANDLER ================= */

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();
  const user = await getUser(ctx.from.id);

  // If user is registered but in the middle of clock-in flow, handle it here.
  const pendingForUser = await getPending(ctx.from.id);
  if (user && pendingForUser?.mode === "clockin" && pendingForUser.step === "await_location") {
    const extra = safeParseExtra(pendingForUser.extra);
    extra.location_of_sft = text;
    await setPendingStep(ctx.from.id, {
      step: "medical_q9",
      extra: stringifyExtra(extra),
    });

    return ctx.reply(TXT.MED_Q9, {
      reply_markup: yesNoInlineKb("med_q9_yes", "med_q9_no"),
    });
  }

  // Registered -> chatbot
  if (user) {
    await updateUsernameIfExists(ctx.from.id, ctx.from.username ?? null);
    return ctx.reply(generateReply(text));
  }

  // Unregistered -> register flow only
  const pending = pendingForUser;
  if (!pending) {
    return ctx.reply(TXT.REG_TIMEOUT, { reply_markup: registerKeyboard() });
  }

  // Register/Edit: waiting for full name
  if (pending.mode === "register" || pending.mode === "edit") {
    // ✅ NEW: commander code step (register only)
    if (pending.mode === "register" && pending.step === "await_comd_pass") {
      const pass = text.trim();
      const extra = safeParseExtra(pending.extra);

      // default to trooper
      let desiredRole = "trooper";

      if (!COMD_PASS) {
        desiredRole = "trooper";
        await ctx.reply(TXT.REG_COMD_DISABLED);
      } else if (pass.toLowerCase() === "skip") {
        desiredRole = "trooper";
        // no need to message
      } else if (pass === COMD_PASS) {
        desiredRole = "commander";
        await ctx.reply(TXT.REG_COMD_CODE_OK);
      } else {
        desiredRole = "trooper";
        await ctx.reply(TXT.REG_COMD_CODE_BAD);
      }

      extra.desired_role = desiredRole;

      await setPendingStep(ctx.from.id, {
        step: "confirm",
        extra: stringifyExtra(extra),
      });

      return ctx.reply(buildConfirmText(pending, pending.platoon), {
        reply_markup: confirmInlineKb(pending.mode),
      });
    }

    // Normal full name step
    if (pending.step !== "await_full_name") return ctx.reply(TXT.PLEASE_USE_BUTTONS);

    await setPendingStep(ctx.from.id, { full_name: text, step: "choose_company" });
    return ctx.reply(TXT.REG_STEP2_COMPANY, { reply_markup: companyInlineKb() });
  }

  // clockin mode doesn't accept free text
  return ctx.reply(TXT.PLEASE_USE_BUTTONS);
});

/* ================= REGISTER/EDIT CALLBACKS ================= */

bot.callbackQuery(/^reg_company:(.+)$/i, async (ctx) => {
  await clearButtons(ctx); // ✅ hide buttons after click

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
  await clearButtons(ctx); // ✅ hide buttons after click

  const platoon = ctx.match[1];
  const pending = await getPending(ctx.from.id);

  if (!pending || pending.step !== "choose_subunit") {
    await ctx.answerCallbackQuery({ text: TXT.START_AGAIN });
    return;
  }

  // Save platoon first
  await setPendingStep(ctx.from.id, { platoon });

  await ctx.answerCallbackQuery();

  // ✅ NEW: if registering, ask for commander code before confirm
  if (pending.mode === "register") {
    await setPendingStep(ctx.from.id, { step: "await_comd_pass" });
    return ctx.reply(TXT.REG_COMD_CODE_PROMPT);
  }

  // Edit flow goes straight to confirm
  await setPendingStep(ctx.from.id, { step: "confirm" });
  return ctx.reply(buildConfirmText({ ...pending, platoon }, platoon), {
    reply_markup: confirmInlineKb(pending.mode),
  });
});

bot.callbackQuery(/^reg_confirm:(register|edit)$/i, async (ctx) => {
  await clearButtons(ctx); // ✅ hide buttons after click

  const mode = ctx.match[1];
  const pending = await getPending(ctx.from.id);

  if (!pending || pending.step !== "confirm" || pending.mode !== mode) {
    await ctx.answerCallbackQuery({ text: TXT.START_AGAIN });
    return;
  }

  if (mode === "register") {
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
  } else {
    await updateUserInfo({
      telegram_user_id: pending.telegram_user_id,
      username: pending.username,
      full_name: pending.full_name,
      company: pending.company,
      platoon: pending.platoon,
    });
  }

  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery();

  const user = await getUser(ctx.from.id);
  const doneMsg = mode === "register" ? TXT.REG_DONE : TXT.EDIT_DONE;

  if (user && isTrooperOrCommander(user)) {
    return ctx.reply(doneMsg, { reply_markup: memberMenuKeyboard() });
  }
  return ctx.reply(doneMsg);
});

bot.callbackQuery("reg_cancel", async (ctx) => {
  await clearButtons(ctx); // ✅ hide buttons after click

  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery({ text: TXT.CANCELLED });

  const user = await getUser(ctx.from.id);
  if (user && isTrooperOrCommander(user)) {
    return ctx.reply(TXT.CANCELLED, { reply_markup: memberMenuKeyboard() });
  }
  if (user) return ctx.reply(TXT.CANCELLED);

  return ctx.reply(TXT.REG_CANCELLED_PROMPT, { reply_markup: registerKeyboard() });
});

/* ================= SRT CALLBACKS ================= */

bot.callbackQuery("srt_clockin", async (ctx) => {
  await clearButtons(ctx); // ✅ hide buttons after click

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

/* ================= MEDICAL + CHECKLIST CALLBACKS ================= */

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
  await clearButtons(ctx); // ✅ hide buttons after click

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
  await deletePending(ctx.from.id); // just in case
  await ctx.answerCallbackQuery();

  return ctx.reply(TXT.SRT_CLOCKOUT_DONE, { reply_markup: memberMenuKeyboard() });
});

bot.callbackQuery("srt_cancel", async (ctx) => {
  await clearButtons(ctx); // ✅ hide buttons after click

  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery({ text: TXT.CANCELLED });
  return ctx.reply(TXT.CANCELLED, { reply_markup: memberMenuKeyboard() });
});

/* ================= VERCEL HANDLER ================= */

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  return webhookCallback(bot, "http")(req, res);
}
