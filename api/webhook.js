import { Bot, webhookCallback, Keyboard } from "grammy";
import { getUser, registerTrooper, touchUser } from "../src/users.js";
import { generateReply } from "../src/chatbot.js";

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const bot = new Bot(mustGetEnv("BOT_TOKEN"));

function registerKeyboard() {
  return new Keyboard().text("📝 Register").resized();
}

function formatWelcome(u) {
  return (
    `Welcome back, ${u.full_name} ✅\n` +
    `Role: ${u.role.toUpperCase()}\n` +
    `Company: ${u.company}\n` +
    `Platoon: ${u.platoon}`
  );
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

/* /start */
bot.command("start", async (ctx) => {
  await touchUser(ctx.from);

  const user = await getUser(ctx.from.id);
  if (user) {
    return ctx.reply(formatWelcome(user));
  }

  return ctx.reply(formatRegisterPrompt(), {
    reply_markup: registerKeyboard(),
  });
});

/* Register button */
bot.hears("📝 Register", async (ctx) => {
  await touchUser(ctx.from);

  const user = await getUser(ctx.from.id);
  if (user) {
    return ctx.reply(formatWelcome(user));
  }

  return ctx.reply(
    "Send your details in ONE message:\n" +
      "Full Name | Company | Platoon\n\n" +
      "Example:\n" +
      "Tan Ah Beng | Alpha | 1"
  );
});

/* Text handler */
bot.on("message:text", async (ctx) => {
  await touchUser(ctx.from);

  const text = ctx.message.text.trim();
  const user = await getUser(ctx.from.id);

  // Not registered → treat message as registration attempt
  if (!user) {
    const parts = text.split("|").map((s) => s.trim()).filter(Boolean);

    if (parts.length < 3) {
      return ctx.reply(formatRegisterPrompt(), {
        reply_markup: registerKeyboard(),
      });
    }

    const [full_name, company, platoon] = parts;

    await registerTrooper({
      telegram_user_id: ctx.from.id,
      username: ctx.from.username ?? null,
      full_name,
      company,
      platoon,
    });

    return ctx.reply(
      `Registered ✅\nName: ${full_name}\nCompany: ${company}\nPlatoon: ${platoon}`
    );
  }

  // Registered user → normal chatbot reply
  const reply = generateReply(text);
  return ctx.reply(reply);
});

/* Vercel webhook handler */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  return webhookCallback(bot, "http")(req, res);
}
