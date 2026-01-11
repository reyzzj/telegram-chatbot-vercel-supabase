import { Bot, webhookCallback, Keyboard, InlineKeyboard } from "grammy";
import { getUser, registerTrooperOnce, updateUsernameIfExists } from "../src/users.js";
import {
  getPending,
  startPending,
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

/* ================= CONFIG ================= */

const COMPANY_CONFIG = {
  Alpha: { label: "Platoon", options: ["1", "2", "3", "4", "5"] },
  Bravo: { label: "Platoon", options: ["1", "2", "3", "4", "5"] },
  Charlie: { label: "Platoon", options: ["1", "2", "3", "4", "5"] },

  Support: {
    label: "Support",
    options: ["MPAT", "Scout", "Pioneer", "Signals", "Mortar"],
  },

  HQ: {
    label: "HQ",
    options: ["Medics", "SSP", "S1", "S2", "S3", "S4"],
  },
};

const COMPANIES = Object.keys(COMPANY_CONFIG);

/* ================= KEYBOARDS ================= */

function registerKeyboard() {
  return new Keyboard().text("📝 Register").resized();
}

function companyInlineKb() {
  const kb = new InlineKeyboard();
  for (const c of COMPANIES) kb.text(c, `reg_company:${c}`).row();
  kb.text("❌ Cancel", "reg_cancel");
  return kb;
}

function subunitInlineKb(company) {
  const kb = new InlineKeyboard();
  for (const opt of COMPANY_CONFIG[company].options) {
    kb.text(opt, `reg_subunit:${opt}`).row();
  }
  kb.text("❌ Cancel", "reg_cancel");
  return kb;
}

function confirmInlineKb() {
  return new InlineKeyboard()
    .text("✅ Confirm", "reg_confirm")
    .text("❌ Cancel", "reg_cancel");
}

/* ================= HELPERS ================= */

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

/* ================= COMMANDS ================= */

bot.command("start", async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (user) {
    await updateUsernameIfExists(ctx.from.id, ctx.from.username ?? null);
    return ctx.reply(welcomeBack(user));
  }

  return ctx.reply(promptRegister(), { reply_markup: registerKeyboard() });
});

bot.hears("📝 Register", async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (user) return ctx.reply(welcomeBack(user));

  await startPending({
    telegram_user_id: ctx.from.id,
    username: ctx.from.username ?? null,
  });

  return ctx.reply("Step 1/3: Send your FULL NAME (one message).");
});

/* ================= TEXT HANDLER ================= */

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();

  const user = await getUser(ctx.from.id);
  if (user) {
    await updateUsernameIfExists(ctx.from.id, ctx.from.username ?? null);
    return ctx.reply(generateReply(text));
  }

  const pending = await getPending(ctx.from.id);
  if (!pending) {
    return ctx.reply(
      "Registration timed out or not started.\nPress 📝 Register to begin again.",
      { reply_markup: registerKeyboard() }
    );
  }

  if (pending.step === "await_full_name") {
    await setPendingStep(ctx.from.id, {
      full_name: text,
      step: "choose_company",
    });

    return ctx.reply("Step 2/3: Select your COMPANY:", {
      reply_markup: companyInlineKb(),
    });
  }

  return ctx.reply("Please use the buttons to continue.");
});

/* ================= CALLBACKS ================= */

bot.callbackQuery(/^reg_company:(.+)$/i, async (ctx) => {
  const company = ctx.match[1];

  const pending = await getPending(ctx.from.id);
  if (!pending || pending.step !== "choose_company") {
    await ctx.answerCallbackQuery({ text: "Please press Register again." });
    return;
  }

  await setPendingStep(ctx.from.id, {
    company,
    step: "choose_subunit",
  });

  await ctx.answerCallbackQuery();

  return ctx.reply(
    `Step 3/3: Select your ${COMPANY_CONFIG[company].label}:`,
    { reply_markup: subunitInlineKb(company) }
  );
});

bot.callbackQuery(/^reg_subunit:(.+)$/i, async (ctx) => {
  const platoon = ctx.match[1];

  const pending = await getPending(ctx.from.id);
  if (!pending || pending.step !== "choose_subunit") {
    await ctx.answerCallbackQuery({ text: "Please press Register again." });
    return;
  }

  await setPendingStep(ctx.from.id, {
    platoon,
    step: "confirm",
  });

  await ctx.answerCallbackQuery();

  return ctx.reply(
    "Confirm your details:\n\n" +
      `Full Name: ${pending.full_name}\n` +
      `Company: ${pending.company}\n` +
      `${COMPANY_CONFIG[pending.company].label}: ${platoon}`,
    { reply_markup: confirmInlineKb() }
  );
});

bot.callbackQuery("reg_confirm", async (ctx) => {
  const pending = await getPending(ctx.from.id);
  if (!pending || pending.step !== "confirm") {
    await ctx.answerCallbackQuery({ text: "Please press Register again." });
    return;
  }

  await registerTrooperOnce({
    telegram_user_id: pending.telegram_user_id,
    username: pending.username,
    full_name: pending.full_name,
    company: pending.company,
    platoon: pending.platoon,
  });

  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery();

  return ctx.reply("Registered ✅\nType /start again.", {
    reply_markup: { remove_keyboard: true },
  });
});

bot.callbackQuery("reg_cancel", async (ctx) => {
  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery({ text: "Cancelled." });

  return ctx.reply("Registration cancelled.\nPress 📝 Register to start again.", {
    reply_markup: registerKeyboard(),
  });
});

/* ================= VERCEL ================= */

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  return webhookCallback(bot, "http")(req, res);
}
