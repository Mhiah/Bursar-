export type Channel = "email" | "telegram" | "whatsapp";
export type SendResult = { status: "sent" | "failed" | "skipped"; error?: string };

/** Email through Resend. */
async function email(to: string, subject: string, text: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: "skipped", error: "Email isn't set up" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text }),
  });
  return res.ok ? { status: "sent" } : { status: "failed", error: `${res.status} ${await res.text()}` };
}

/** Telegram bot message. The customer must have started a chat with the bot first. */
async function telegram(chatId: string, text: string): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { status: "skipped", error: "Telegram isn't set up" };
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  return res.ok ? { status: "sent" } : { status: "failed", error: `${res.status} ${await res.text()}` };
}

/** WhatsApp Cloud API text message. Outside a 24-hour reply window WhatsApp requires an
 * approved template, so a plain message may be refused; the failure is recorded. */
async function whatsapp(phone: string, text: string): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { status: "skipped", error: "WhatsApp isn't set up" };
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: phone.replace(/[^\d]/g, ""), type: "text", text: { body: text } }),
  });
  return res.ok ? { status: "sent" } : { status: "failed", error: `${res.status} ${await res.text()}` };
}

export async function send(
  channel: Channel,
  customer: { email: string | null; telegram_chat_id: string | null; whatsapp: string | null },
  subject: string,
  text: string,
): Promise<SendResult> {
  try {
    if (channel === "email") return customer.email ? email(customer.email, subject, text) : { status: "skipped", error: "No email for this customer" };
    if (channel === "telegram")
      return customer.telegram_chat_id ? telegram(customer.telegram_chat_id, text) : { status: "skipped", error: "No Telegram for this customer" };
    return customer.whatsapp ? whatsapp(customer.whatsapp, text) : { status: "skipped", error: "No WhatsApp number for this customer" };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}
