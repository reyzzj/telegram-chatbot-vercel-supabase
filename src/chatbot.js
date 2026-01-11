// Simple keyword-based chatbot (edit as you like)
export function generateReply(text) {
  const t = (text || "").trim().toLowerCase();
  if (!t) return "Send me a message 🙂";

  if (t.includes("help")) {
    return ["Commands:", "/start - intro", "Ask: timing, contact, status, faq"].join("\n");
  }
  if (t.includes("timing") || t.includes("clock") || t.includes("duty")) return "Duty timing noted. (You can expand this logic.)";
  if (t.includes("contact")) return "Contact your commander/admin for urgent matters.";
  if (t.includes("status")) return "Status: I'm online ✅";
  if (t.includes("faq")) return "FAQ: type 'help'.";

  return `You said: ${text}`;
}
