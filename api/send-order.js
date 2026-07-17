// /api/send-order.js
// Serverless function (Vercel Node.js runtime). Receives the checkout payload
// from the frontend and forwards a formatted order ticket to a Telegram chat
// via the Bot API — no official WhatsApp Business API needed.
//
// Required environment variables (set these in your hosting dashboard,
// NEVER in frontend code):
//   BOT_TOKEN_GODHULI  - token from @BotFather, for Godhuli Cafe and Bistro's bot
//   CHAT_ID_GODHULI    - the chat/group that should receive Godhuli's order tickets

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { orderId, name, phone, address, payment, items, itemTotal, deliveryFee, grandTotal } = req.body || {};

  // Never trust the client — re-validate the shape of the order server-side.
  if (
    !orderId || !name || !phone || !address ||
    !Array.isArray(items) || items.length === 0 ||
    typeof grandTotal !== 'number'
  ) {
    return res.status(400).json({ success: false, error: 'Missing or invalid order details' });
  }

  const BOT_TOKEN_GODHULI = process.env.BOT_TOKEN_GODHULI;
  const CHAT_ID_GODHULI = process.env.CHAT_ID_GODHULI;

  if (!BOT_TOKEN_GODHULI || !CHAT_ID_GODHULI) {
    console.error('Telegram bot not configured: missing BOT_TOKEN_GODHULI / CHAT_ID_GODHULI');
    return res.status(500).json({ success: false, error: 'Notification service not configured' });
  }

  const text = formatOrderMessage({ orderId, name, phone, address, payment, items, itemTotal, deliveryFee, grandTotal });

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN_GODHULI}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID_GODHULI,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const tgData = await tgRes.json();

    if (!tgData.ok) {
      console.error('Telegram API rejected the message:', tgData);
      return res.status(502).json({ success: false, error: tgData.description || 'Telegram API error' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Telegram request failed:', err);
    return res.status(500).json({ success: false, error: 'Could not reach Telegram' });
  }
}

// Telegram's HTML parse mode only understands a handful of tags (b, i, u, s,
// a, code, pre, etc). Anything else in user-typed text — & < > — must be
// escaped or Telegram will reject the whole message.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatOrderMessage({ orderId, name, phone, address, payment, items, itemTotal, deliveryFee, grandTotal }) {
  const itemLines = items
    .map((i) => `• ${escapeHtml(i.name)} × ${i.qty} — ₹${i.qty * i.price}`)
    .join('\n');

  const paymentLabel = payment === 'upi' ? 'Pay Now via UPI' : 'Pay on Delivery (Cash / UPI QR at door)';
  const deliveryLine = deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`;

  return [
    `🍽️ <b>NEW ORDER — ${escapeHtml(orderId)}</b>`,
    '━━━━━━━━━━━━━━━━━━',
    `<b>Name:</b> ${escapeHtml(name)}`,
    `<b>WhatsApp:</b> <code>${escapeHtml(phone)}</code>`,
    `<b>Address:</b> ${escapeHtml(address)}`,
    '',
    '<b>Items</b>',
    itemLines,
    '',
    `<b>Item Total:</b> ₹${itemTotal}`,
    `<b>Delivery Fee:</b> ${deliveryLine}`,
    `<b>Grand Total:</b> ₹${grandTotal}`,
    '',
    `<b>Payment:</b> ${escapeHtml(paymentLabel)}`,
  ].join('\n');
}

