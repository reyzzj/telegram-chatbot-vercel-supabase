import { Bot, webhookCallback } from "grammy";
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

function formatRegisterPrompt() {
  return (
    "You are not registered yet.\n\n" +
    "You can only register as TROOPER.\n" +
    "Use:\n" +
    "/register Full Name | Company | Platoon\n\n" +
    "Example:\n" +
    "/register Tan Ah Beng | Alpha | 1"
  );
}

// /start
bot.command("start", async (ctx) => {
  await touchUser(ctx.from);

  const user = await getUser(ctx.from.id);
  if (user) return ctx.reply(formatWelcome(user));

  return ctx.reply(formatRegisterPrompt());
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
  if (!user) return ctx.reply(formatRegisterPrompt());

  const reply = generateReply(ctx.message.text);
  return ctx.reply(reply);
});

export default async function handler(req, res) {
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const header = req.headers["x-telegram-bot-api-secret-token"];
    if (header !== secret) return res.status(401).send("Unauthorized");
  }

  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  return webhookCallback(bot, "http")(req, res);
}
