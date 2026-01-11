import { Bot } from "grammy";
import { webhookCallback } from "grammy";
import { generateReply } from "../src/chatbot.js";
import { upsertUser, logMessage } from "../src/logger.js";

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const bot = new Bot(mustGetEnv("BOT_TOKEN"));

bot.command("start", async (ctx) => {
  await upsertUser(ctx.from);
  await logMessage({ telegram_user_id: ctx.from.id, chat_id: ctx.chat.id, direction: "in", message: "/start" });

  const msg = "Hello! I'm your Telegram chatbot ✅\nType 'help' to see options.";
  await ctx.reply(msg);

  await logMessage({ telegram_user_id: ctx.from.id, chat_id: ctx.chat.id, direction: "out", message: msg });
});

bot.on("message:text", async (ctx) => {
  await upsertUser(ctx.from);
  await logMessage({ telegram_user_id: ctx.from.id, chat_id: ctx.chat.id, direction: "in", message: ctx.message.text });

  const reply = generateReply(ctx.message.text);
  await ctx.reply(reply);

  await logMessage({ telegram_user_id: ctx.from.id, chat_id: ctx.chat.id, direction: "out", message: reply });
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
