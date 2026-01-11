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

bot.command("start", async (ctx) => {
  const u = await getUser(ctx.from.id);
  if (u) {
    await touchUser(ctx.from);
    return ctx.reply(formatWelcome(u));
  }

  return ctx.reply(
    [
      "You are not registered yet.",
      "You can only register as a TROOPER (commanders/admins are pre-added).",
      "",
      "Register using:",
      "/register Full Name | Company | Platoon",
      "",
      "Example:",
      "/register Tan Ah Kow | A Coy | 2 Platoon",
    ].join("\n")
  );
});

bot.command("register", async (ctx) => {
  const existing = await getUser(ctx.from.id);
  if (existing) {
    await touchUser(ctx.from);
    return ctx.reply(`You are already registered.\n\n${formatWelcome(existing)}`);
  }

  const raw = (ctx.message.text || "").replace(/^\/register\s*/i, "").trim();
  const parts = raw.split("|").map((s) => s.trim()).filter(Boolean);

  if (parts.length < 3) {
    return ctx.reply(
      [
        "Registration format:",
        "/register Full Name | Company | Platoon",
        "",
        "Example:",
        "/register Tan Ah Kow | A Coy | 2 Platoon",
      ].join("\n")
    );
  }

  const [full_name, company, platoon] = parts;

  try {
    await registerTrooper({ from: ctx.from, full_name, company, platoon });
    const u = await getUser(ctx.from.id);
    return ctx.reply(`Registered ✅\n\n${formatWelcome(u)}`);
  } catch (e) {
    // Most common: duplicate key if they registered between checks.
    return ctx.reply("Registration failed. If you already registered, run /start.");
  }
});

bot.on("message:text", async (ctx) => {
  const u = await getUser(ctx.from.id);
  if (!u) {
    return ctx.reply("Please register first using: /register Full Name | Company | Platoon");
  }

  await touchUser(ctx.from);
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
