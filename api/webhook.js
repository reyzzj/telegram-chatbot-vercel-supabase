import { keyboard } from "telegraf/markup";
import { Bot, webhookCallback, Keyboard } from "grammy";
import { generateReply } from "../src/chatbot.js";
import { getUser, registerTrooper, touchUser } from "../src/users.js";

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const bot = new Bot(mustGetEnv("BOT_TOKEN"));

function formatWelcome(u) {
  const role = (u.role || "trooper").toUpperCase();
  const name = u.full_name || u.username || "there";
  return `Welcome back, ${name} ✅\nRole: ${role}\nCompany: ${u.company}\nPlatoon: ${u.platoon}`;
}

function registerKeyboard() {
  return new Keyboard().text("📝 Register").resized();
}

function formatRegisterPrompt() {
  return (
    "You are not registered yet.\n\n" +
    "Press 📝 Register, then send:\n" +
    "Full Name | Company | Platoon\n\n" +
    "Example:\n" +
    "Tan Ah Beng | Alpha | 1"
  );
}

// /start
bot.command("start", async (ctx) => {
  await touchUser(ctx.from);

  const user = await getUser(ctx.from.id);
  if (user) return ctx.reply(formatWelcome(user));

  return ctx.reply(formatRegisterPrompt(), { reply_markup: registerKeyboard() });
});

bot.hears("📝 Register", async (ctx) => {
  await touchUser(ctx.from);

  const user = await getUser(ctx.from.id);
  if (user) return ctx.reply(formatWelcome(user));

  return ctx.reply(
    "Send your details in ONE message:\nFull Name | Company | Platoon\n\nExample:\nTan Ah Beng | Alpha | 1"
  );
});

// /register Full Name | Company | Platoon
bot.command("register", async (ctx) => {
  await touchUser(ctx.from);

  const existing = await getUser(ctx.from.id);
  if (existing) return ctx.reply(formatWelcome(existing));

  const raw = (ctx.message?.text || "").replace(/^\/register(@\w+)?\s*/i, "").trim();
  const parts = raw.split("|").map((s) => s.trim()).filter(Boolean);

  if (parts.length < 3) {
    return ctx.reply(formatRegisterPrompt());
  }

  const [full_name, company, platoon] = parts;

  await registerTrooper({
  telegram_user_id: ctx.from.id,
  full_name,
  company,
  platoon,
  username: ctx.from.username ?? null,
});


  return ctx.reply(`Registered ✅\nName: ${full_name}\nCompany: ${company}\nPlatoon: ${platoon}`);
});

// Text messages
bot.on("message:text", async (ctx) => {
  await touchUser(ctx.from);

  const user = await getUser(ctx.from.id);
  const text = (ctx.message?.text || "").trim();

  // If not registered: treat message as registration details
  if (!user) {
    // If they typed /register still, strip it
    const raw = text.replace(/^\/register(@\w+)?\s*/i, "").trim();
    const parts = raw.split("|").map((s) => s.trim()).filter(Boolean);

    if (parts.length < 3) {
      return ctx.reply(formatRegisterPrompt(), { reply_markup: registerKeyboard() });
    }

    const [full_name, company, platoon] = parts;

    await registerTrooper({
      telegram_user_id: ctx.from.id,
      full_name,
      company,
      platoon,
      username: ctx.from.username ?? null,
    });

    return ctx.reply(`Registered ✅\nName: ${full_name}\nCompany: ${company}\nPlatoon: ${platoon}`);
  }

  // Registered users: normal chatbot reply
  const reply = generateReply(text);
  return ctx.reply(reply);
});
