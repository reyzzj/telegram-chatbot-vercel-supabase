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
import {
  getPending,
  startPending,
  startClockInPending,
  setPendingStep,
  deletePending,
} from "../src/pending.js";
import { generateReply } from "../src/chatbot.js";

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const bot = new Bot(mustGetEnv("BOT_TOKEN"));

/* ===== CONFIG (edit to your unit) ===== */
const COMPANY_CONFIG = {
  Alpha: { label: "Platoon", options: ["1", "2", "3", "4", "5"] },
  Bravo: { label: "Platoon", options: ["1", "2", "3", "4", "5"] },
  Charlie: { label: "Platoon", options: ["1", "2", "3", "4", "5"] },
  Support: { label: "Support", options: ["MPAT", "Scout", "Pioneer", "Signals", "Mortar"] },
  HQ: { label: "HQ", options: ["Medics", "SSP", "S1", "S2", "S3", "S4"] },
};
const COMPANIES = Object.keys(COMPANY_CONFIG);

/* ===== Keyboards ===== */

function registerKeyboard() {
  return new Keyboard().text("📝 Register").resized();
}

function memberMenuKeyboard() {
  return new Keyboard().text("🛠 Edit Info").text("⏱ SRT Clock").resized();
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

function wellnessInlineKb() {
  return new InlineKeyboard()
    .text("✅ I am OK", "well_ok")
    .text("❌ Not OK", "well_not_ok");
}

/* ===== Helpers ===== */

function promptRegister() {
  return "You are not registered yet.\nPress 📝 Register to begin.";
}

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

/* ===== /start ===== */

bot.command("start", async (ctx) => {
  const user = await getUser(ctx.from.id);

  if (!user) {
    return ctx.reply(promptRegister(), { reply_markup: registerKeyboard() });
  }

  await updateUsernameIfExists(ctx.from.id, ctx.from.username ?? null);

  if (isTrooperOrCommander(user)) {
    return ctx.reply(welcomeBack(user), { reply_markup: memberMenuKeyboard() });
  }

  return ctx.reply(welcomeBack(user));
});

/* ===== Register (trooper only) ===== */

bot.hears("📝 Register", async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (user) {
    await updateUsernameIfExists(ctx.from.id, ctx.from.username ?? null);
    if (isTrooperOrCommander(user)) return ctx.reply(welcomeBack(user), { reply_markup: memberMenuKeyboard() });
    return ctx.reply(welcomeBack(user));
  }

  await startPending({
    telegram_user_id: ctx.from.id,
    username: ctx.from.username ?? null,
    mode: "register",
  });

  return ctx.reply("Step 1/3: Send your FULL NAME (one message).");
});

/* ===== Edit Info ===== */

bot.hears("🛠 Edit Info", async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) return ctx.reply(promptRegister(), { reply_markup: registerKeyboard() });
  if (!isTrooperOrCommander(user)) return ctx.reply("Edit is only for trooper/commander.");

  await startPending({
    telegram_user_id: ctx.from.id,
    username: ctx.from.username ?? null,
    mode: "edit",
  });

  return ctx.reply("Edit 1/3: Send your FULL NAME (one message).");
});

/* ===== SRT Clock menu ===== */

bot.hears("⏱ SRT Clock", async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) return ctx.reply(promptRegister(), { reply_markup: registerKeyboard() });
  if (!isTrooperOrCommander(user)) return ctx.reply("SRT clock is only for trooper/commander.");

  const open = await getOpenSrtSession(ctx.from.id);

  return ctx.reply(
    open ? "You are CLOCKED IN.\nChoose:" : "You are CLOCKED OUT.\nChoose:",
    { reply_markup: srtInlineKb(!!open) }
  );
});

/* ===== Text handler ===== */

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();
  const user = await getUser(ctx.from.id);

  if (user) {
    await updateUsernameIfExists(ctx.from.id, ctx.from.username ?? null);
    return ctx.reply(generateReply(text));
  }

  const pending = await getPending(ctx.from.id);
  if (!pending) {
    return ctx.reply("Registration timed out.\nPress 📝 Register to begin again.", {
      reply_markup: registerKeyboard(),
    });
  }

  // Only accept full name during register/edit
  if (pending.mode === "register" || pending.mode === "edit") {
    if (pending.step !== "await_full_name") return ctx.reply("Please use the buttons to continue.");

    await setPendingStep(ctx.from.id, { full_name: text, step: "choose_company" });

    return ctx.reply("Step 2/3: Select your COMPANY:", { reply_markup: companyInlineKb() });
  }

  // clockin mode doesn't accept free text
  return ctx.reply("Please use the buttons.");
});

/* ===== Register/Edit callbacks ===== */

bot.callbackQuery(/^reg_company:(.+)$/i, async (ctx) => {
  const company = ctx.match[1];
  const pending = await getPending(ctx.from.id);

  if (!pending || pending.step !== "choose_company") {
    await ctx.answerCallbackQuery({ text: "Please start again." });
    return;
  }

  if (!COMPANY_CONFIG[company]) {
    await ctx.answerCallbackQuery({ text: "Invalid company." });
    return;
  }

  await setPendingStep(ctx.from.id, { company, step: "choose_subunit" });
  await ctx.answerCallbackQuery();

  return ctx.reply(`Step 3/3: Select your ${COMPANY_CONFIG[company].label}:`, {
    reply_markup: subunitInlineKb(company),
  });
});

bot.callbackQuery(/^reg_subunit:(.+)$/i, async (ctx) => {
  const platoon = ctx.match[1];
  const pending = await getPending(ctx.from.id);

  if (!pending || pending.step !== "choose_subunit") {
    await ctx.answerCallbackQuery({ text: "Please start again." });
    return;
  }

  await setPendingStep(ctx.from.id, { platoon, step: "confirm" });
  await ctx.answerCallbackQuery();

  const cfg = COMPANY_CONFIG[pending.company];

  return ctx.reply(
    "Confirm your details:\n\n" +
      `Full Name: ${pending.full_name}\n` +
      `Company: ${pending.company}\n` +
      `${cfg.label}: ${platoon}`,
    { reply_markup: confirmInlineKb(pending.mode) }
  );
});

bot.callbackQuery(/^reg_confirm:(register|edit)$/i, async (ctx) => {
  const mode = ctx.match[1];
  const pending = await getPending(ctx.from.id);

  if (!pending || pending.step !== "confirm" || pending.mode !== mode) {
    await ctx.answerCallbackQuery({ text: "Please start again." });
    return;
  }

  if (mode === "register") {
    await registerTrooperOnce({
      telegram_user_id: pending.telegram_user_id,
      username: pending.username,
      full_name: pending.full_name,
      company: pending.company,
      platoon: pending.platoon,
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
  if (user && isTrooperOrCommander(user)) {
    return ctx.reply(mode === "register" ? "Registered ✅" : "Updated ✅", {
      reply_markup: memberMenuKeyboard(),
    });
  }

  return ctx.reply(mode === "register" ? "Registered ✅" : "Updated ✅");
});

bot.callbackQuery("reg_cancel", async (ctx) => {
  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery({ text: "Cancelled." });

  const user = await getUser(ctx.from.id);
  if (user && isTrooperOrCommander(user)) return ctx.reply("Cancelled.", { reply_markup: memberMenuKeyboard() });
  if (user) return ctx.reply("Cancelled.");
  return ctx.reply("Cancelled.\nPress 📝 Register to start again.", { reply_markup: registerKeyboard() });
});

/* ===== SRT callbacks ===== */

bot.callbackQuery("srt_clockin", async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user || !isTrooperOrCommander(user)) {
    await ctx.answerCallbackQuery({ text: "Not allowed." });
    return;
  }

  const open = await getOpenSrtSession(ctx.from.id);
  if (open) {
    await ctx.answerCallbackQuery({ text: "Already clocked in." });
    return;
  }

  await startClockInPending({
    telegram_user_id: ctx.from.id,
    username: ctx.from.username ?? null,
  });

  await ctx.answerCallbackQuery();
  return ctx.reply("Before clocking in, are you feeling OK?", { reply_markup: wellnessInlineKb() });
});

bot.callbackQuery("well_ok", async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user || !isTrooperOrCommander(user)) {
    await ctx.answerCallbackQuery({ text: "Not allowed." });
    return;
  }

  const pending = await getPending(ctx.from.id);
  if (!pending || pending.mode !== "clockin" || pending.step !== "wellness") {
    await ctx.answerCallbackQuery({ text: "Please press Clock In again." });
    return;
  }

  await srtClockIn({
    telegram_user_id: ctx.from.id,
    role: user.role,
    wellness_ok: true,
  });

  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery();

  return ctx.reply("✅ Clocked IN to SRT.\nStatus: OK", { reply_markup: memberMenuKeyboard() });
});

bot.callbackQuery("well_not_ok", async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user || !isTrooperOrCommander(user)) {
    await ctx.answerCallbackQuery({ text: "Not allowed." });
    return;
  }

  const pending = await getPending(ctx.from.id);
  if (!pending || pending.mode !== "clockin" || pending.step !== "wellness") {
    await ctx.answerCallbackQuery({ text: "Please press Clock In again." });
    return;
  }

  // Do nothing: no DB record, no reply message.
  // Just clear the pending state and remove the buttons silently.
  await deletePending(ctx.from.id);

  try {
    await ctx.editMessageReplyMarkup({ reply_markup: null });
  } catch {}

  await ctx.answerCallbackQuery();
});

bot.callbackQuery("srt_clockout", async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user || !isTrooperOrCommander(user)) {
    await ctx.answerCallbackQuery({ text: "Not allowed." });
    return;
  }

  const open = await getOpenSrtSession(ctx.from.id);
  if (!open) {
    await ctx.answerCallbackQuery({ text: "You are not clocked in." });
    return;
  }

  await srtClockOut({ telegram_user_id: ctx.from.id });
  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery();

  return ctx.reply("⏱ Clocked OUT of SRT ✅", { reply_markup: memberMenuKeyboard() });
});

bot.callbackQuery("srt_cancel", async (ctx) => {
  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery({ text: "Cancelled." });
  return ctx.reply("Cancelled.", { reply_markup: memberMenuKeyboard() });
});

/* ===== Vercel handler ===== */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  return webhookCallback(bot, "http")(req, res);
}
