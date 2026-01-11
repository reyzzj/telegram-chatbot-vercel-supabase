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

/**
 * CONFIG: company -> subunit options + whether to ask section
 * Edit these names/options to your real ones.
 */
const COMPANY_CONFIG = {
  Alpha: { label: "Platoon", options: ["1", "2", "3", "4", "5"], askSection: true },
  Bravo: { label: "Platoon", options: ["1", "2", "3", "4", "5"], askSection: true },
  Charlie: { label: "Platoon", options: ["1", "2", "3", "4", "5"], askSection: true },

  Support: {
    label: "Support",
    options: ["MPAT", "Scout", "Pioneer", "Signals", "Mortar"],
    askSection: true,
  },

  HQ: {
    label: "HQ",
    options: ["Medics", "SSP", "S1", "S2", "S3", "S4"],
    askSection: false,
  },
};

const COMPANIES = Object.keys(COMPANY_CONFIG);
const SECTIONS = ["1", "2"];

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
  const cfg = COMPANY_CONFIG[company];
  const kb = new InlineKeyboard();
  for (const opt of cfg.options) kb.text(opt, `reg_subunit:${opt}`).row();
  kb.text("❌ Cancel", "reg_cancel");
  return kb;
}

function sectionInlineKb() {
  const kb = new InlineKeyboard();
  for (const s of SECTIONS) kb.text(s, `reg_section:${s}`).row();
  kb.text("❌ Cancel", "reg_cancel");
  return kb;
}

function confirmInlineKb() {
  return new InlineKeyboard()
    .text("✅ Confirm", "reg_confirm")
    .text("❌ Cancel", "reg_cancel");
}

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

/* /start */
bot.command("start", async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (user) {
    await updateUsernameIfExists(ctx.from.id, ctx.from.username ?? null);
    return ctx.reply(welcomeBack(user));
  }

  return ctx.reply(promptRegister(), { reply_markup: registerKeyboard() });
});

/* Register button */
bot.hears("📝 Register", async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (user) return ctx.reply(welcomeBack(user));

  await startPending({
    telegram_user_id: ctx.from.id,
    username: ctx.from.username ?? null,
  });

  return ctx.reply("Step 1/4: Send your FULL NAME (one message).");
});

/* Text messages */
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();

  // If registered -> chatbot
  const user = await getUser(ctx.from.id);
  if (user) {
    await updateUsernameIfExists(ctx.from.id, ctx.from.username ?? null);
    return ctx.reply(generateReply(text));
  }

  // Unregistered -> registration flow
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

    return ctx.reply("Step 2/4: Select your COMPANY:", {
      reply_markup: companyInlineKb(),
    });
  }

  if (pending.step === "choose_company") {
    return ctx.reply("Please tap a COMPANY button.", {
      reply_markup: companyInlineKb(),
    });
  }

  if (pending.step === "choose_subunit") {
    return ctx.reply("Please tap a button.", {
      reply_markup: subunitInlineKb(pending.company),
    });
  }

  if (pending.step === "choose_section") {
    return ctx.reply("Please tap a SECTION button.", {
      reply_markup: sectionInlineKb(),
    });
  }

  if (pending.step === "confirm") {
    return ctx.reply("Please tap ✅ Confirm or ❌ Cancel.", {
      reply_markup: confirmInlineKb(),
    });
  }

  return ctx.reply(promptRegister(), { reply_markup: registerKeyboard() });
});

/* Company chosen */
bot.callbackQuery(/^reg_company:(.+)$/i, async (ctx) => {
  const company = ctx.match[1];

  const user = await getUser(ctx.from.id);
  if (user) {
    await ctx.answerCallbackQuery();
    return ctx.reply(welcomeBack(user));
  }

  const pending = await getPending(ctx.from.id);
  if (!pending || pending.step !== "choose_company") {
    await ctx.answerCallbackQuery({ text: "Please press Register again." });
    return;
  }

  if (!COMPANY_CONFIG[company]) {
    await ctx.answerCallbackQuery({ text: "Invalid company." });
    return;
  }

  await setPendingStep(ctx.from.id, {
    company,
    platoon: null,
    section: null,
    step: "choose_subunit",
  });

  await ctx.answerCallbackQuery();

  const cfg = COMPANY_CONFIG[company];
  return ctx.reply(`Step 3/4: Select your ${cfg.label}:`, {
    reply_markup: subunitInlineKb(company),
  });
});

/* Subunit chosen (Platoon/Support/HQ options) */
bot.callbackQuery(/^reg_subunit:(.+)$/i, async (ctx) => {
  const subunit = ctx.match[1];

  const user = await getUser(ctx.from.id);
  if (user) {
    await ctx.answerCallbackQuery();
    return ctx.reply(welcomeBack(user));
  }

  const pending = await getPending(ctx.from.id);
  if (!pending || pending.step !== "choose_subunit") {
    await ctx.answerCallbackQuery({ text: "Please press Register again." });
    return;
  }

  const cfg = COMPANY_CONFIG[pending.company];
  if (!cfg) {
    await ctx.answerCallbackQuery({ text: "Invalid company flow." });
    return;
  }

  await setPendingStep(ctx.from.id, {
    platoon: subunit,
    step: cfg.askSection ? "choose_section" : "confirm",
  });

  await ctx.answerCallbackQuery();

  if (cfg.askSection) {
    return ctx.reply("Step 4/4: Select your SECTION:", {
      reply_markup: sectionInlineKb(),
    });
  }

  // HQ: no section -> confirm immediately
  const latest = await getPending(ctx.from.id);
  return ctx.reply(
    "Confirm your details:\n\n" +
      `Full Name: ${latest.full_name}\n` +
      `Company: ${latest.company}\n` +
      `${cfg.label}: ${latest.platoon}`,
    { reply_markup: confirmInlineKb() }
  );
});

/* Section chosen */
bot.callbackQuery(/^reg_section:(.+)$/i, async (ctx) => {
  const section = ctx.match[1];

  const user = await getUser(ctx.from.id);
  if (user) {
    await ctx.answerCallbackQuery();
    return ctx.reply(welcomeBack(user));
  }

  const pending = await getPending(ctx.from.id);
  if (!pending || pending.step !== "choose_section") {
    await ctx.answerCallbackQuery({ text: "Please press Register again." });
    return;
  }

  const cfg = COMPANY_CONFIG[pending.company];
  if (!cfg || !cfg.askSection) {
    await ctx.answerCallbackQuery({ text: "Section not required." });
    return;
  }

  await setPendingStep(ctx.from.id, { section, step: "confirm" });
  await ctx.answerCallbackQuery();

  const latest = await getPending(ctx.from.id);

  return ctx.reply(
    "Confirm your details:\n\n" +
      `Full Name: ${latest.full_name}\n` +
      `Company: ${latest.company}\n` +
      `${cfg.label}: ${latest.platoon}\n` +
      `Section: ${latest.section}`,
    { reply_markup: confirmInlineKb() }
  );
});

/* Confirm registration (ONLY DB write to users happens here) */
bot.callbackQuery("reg_confirm", async (ctx) => {
  const existing = await getUser(ctx.from.id);
  if (existing) {
    await deletePending(ctx.from.id);
    await ctx.answerCallbackQuery();
    return ctx.reply(welcomeBack(existing));
  }

  const pending = await getPending(ctx.from.id);
  if (!pending || pending.step !== "confirm") {
    await ctx.answerCallbackQuery({ text: "Please press Register again." });
    return;
  }

  const cfg = COMPANY_CONFIG[pending.company];
  const platoonStored =
    cfg?.askSection ? `${pending.platoon} Sec ${pending.section}` : `${pending.platoon}`;

  await registerTrooperOnce({
    telegram_user_id: pending.telegram_user_id,
    username: pending.username,
    full_name: pending.full_name,
    company: pending.company,
    platoon: platoonStored,
  });

  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery();

  return ctx.reply("Registered ✅\nType /start again.", {
    reply_markup: { remove_keyboard: true },
  });
});

/* Cancel */
bot.callbackQuery("reg_cancel", async (ctx) => {
  await deletePending(ctx.from.id);
  await ctx.answerCallbackQuery({ text: "Cancelled." });
  return ctx.reply("Registration cancelled.\nPress 📝 Register to start again.", {
    reply_markup: registerKeyboard(),
  });
});

/* Vercel handler */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  return webhookCallback(bot, "http")(req, res);
}
