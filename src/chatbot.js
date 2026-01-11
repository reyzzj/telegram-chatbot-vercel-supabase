// Minimal chatbot logic. Customize later.
export function generateReply(text) {
  const t = (text || "").trim();
  if (!t) return "Send me a message 🙂";

  const lc = t.toLowerCase();

  if (lc === "/help" || lc.includes("help")) {
    return [
      "Commands:",
      "/start - check status",
      "/register Full Name | Company | Platoon - register (trooper only)",
    ].join("\n");
  }

  // Simple default reply:
  return "Noted ✅";
}
