import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SB_URL = "https://mbkanieqhxryeksalrti.supabase.co";

const ALLOWED_ORIGINS = [
  "http://localhost:8000",
  "https://shopfantier.com",
  "https://www.shopfantier.com",
];

const FANTIER_ADMIN_EMAIL = Deno.env.get("FANTIER_ADMIN_EMAIL") || "";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getCorsOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  return ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function escapeHtml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNgn(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "₦0";
  return "₦" + value.toLocaleString("en-NG");
}

function adminEmailHtml(order: Record<string, unknown>): string {
  const items = (order.items as Array<Record<string, unknown>>) || [];
  const itemsHtml = items.map((item) => {
    const name = item.name || "";
    const size = item.size || "One Size";
    const price = item.price || 0;
    const customOn = item.customOn === true;
    const cName = item.cName || "";
    const cNum = item.cNum || "";
    const customDetail = customOn ? ` (Custom: ${escapeHtml(cName)} #${escapeHtml(cNum)})` : "";
    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #222">${escapeHtml(String(name))}${customDetail}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #222;color:#A0A0A0;text-align:center">${escapeHtml(String(size))}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #222;color:#E8920A;text-align:right;font-weight:700">${formatNgn(price)}</td>
    </tr>`;
  }).join("");

  const receiptHtml = order.receipt_url
    ? `<p><a href="${escapeHtml(String(order.receipt_url))}" style="display:inline-block;background:#E8920A;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:700">View Receipt</a></p>`
    : "";

  return `
    <div style="background:#050505;color:#F5F5F5;font-family:Inter,sans-serif;padding:32px;max-width:600px;margin:0 auto;border-radius:12px">
      <div style="font-size:28px;font-weight:900;letter-spacing:2px;margin-bottom:24px">FANTIER</div>
      <h2 style="margin-bottom:16px">New Order Notification</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <tr><td style="padding:6px 0;color:#999">Ref</td><td style="padding:6px 0;font-weight:700">${escapeHtml(String(order.ref))}</td></tr>
        <tr><td style="padding:6px 0;color:#999">Customer</td><td style="padding:6px 0">${escapeHtml(String(order.customer_name || ""))}</td></tr>
        <tr><td style="padding:6px 0;color:#999">Phone</td><td style="padding:6px 0">${escapeHtml(String(order.phone || ""))}</td></tr>
        <tr><td style="padding:6px 0;color:#999">Email</td><td style="padding:6px 0">${escapeHtml(String(order.email || ""))}</td></tr>
        <tr><td style="padding:6px 0;color:#999">Address</td><td style="padding:6px 0">${escapeHtml(String(order.address || ""))}, ${escapeHtml(String(order.city || ""))}</td></tr>
        <tr><td style="padding:6px 0;color:#999">Status</td><td style="padding:6px 0">${escapeHtml(String(order.status || ""))}</td></tr>
        <tr><td style="padding:6px 0;color:#999">Payment</td><td style="padding:6px 0">${escapeHtml(String(order.payment_method || ""))}</td></tr>
      </table>
      <h3 style="margin-bottom:8px">Items</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <thead><tr><th style="text-align:left;padding:6px 0;color:#999">Item</th><th style="text-align:center;padding:6px 0;color:#999">Size</th><th style="text-align:right;padding:6px 0;color:#999">Price</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <table style="width:100%;margin-bottom:16px">
        <tr><td style="padding:4px 0;color:#999">Subtotal</td><td style="padding:4px 0;text-align:right">${formatNgn(order.subtotal)}</td></tr>
        <tr><td style="padding:4px 0;color:#999">Delivery Fee</td><td style="padding:4px 0;text-align:right">Calculated separately</td></tr>
        <tr><td style="padding:8px 0;font-weight:700">Total</td><td style="padding:8px 0;text-align:right;font-weight:700">${formatNgn(order.total)}</td></tr>
      </table>
      ${order.note ? `<p style="margin-top:12px;padding:10px;background:#1a1a1a;border-left:3px solid #E8920A;font-size:13px;line-height:1.5"><strong>Note:</strong> ${escapeHtml(String(order.note))}</p>` : ""}
      ${receiptHtml}
    </div>
  `;
}

function customerEmailHtml(order: Record<string, unknown>): string {
  const items = (order.items as Array<Record<string, unknown>>) || [];
  const itemsHtml = items.map((item) => {
    const name = item.name || "";
    const size = item.size || "One Size";
    return `<li>${escapeHtml(String(name))} (${escapeHtml(String(size))})</li>`;
  }).join("");

  let paymentNote = "";
  if (order.payment_method === "Bank Transfer") {
    paymentNote = `<div style="background:#1a1a1a;border-left:3px solid #E8920A;padding:12px;margin:16px 0;font-size:14px">
      <strong>Payment Status: Pending</strong><br>
      Your order has been received but payment has not been confirmed yet. Bank Transfer payments are verified manually. Uploading a receipt does not automatically confirm payment. We will check your transfer and update your order status once confirmed.
    </div>`;
  }

  const receiptHtml = order.receipt_url
    ? `<p><strong>Receipt:</strong> <a href="${escapeHtml(String(order.receipt_url))}" style="color:#E8920A">View receipt</a></p>`
    : "";

  return `
    <div style="background:#050505;color:#F5F5F5;font-family:Inter,sans-serif;padding:32px;max-width:600px;margin:0 auto;border-radius:12px">
      <div style="font-size:28px;font-weight:900;letter-spacing:2px;margin-bottom:24px">FANTIER</div>
      <h2 style="margin-bottom:16px">Your Order Confirmed</h2>
      <p>Thank you for your order. Ref: <strong>${escapeHtml(String(order.ref))}</strong></p>
      <h3 style="margin-bottom:8px">Items</h3>
      <ul style="margin-bottom:16px">${itemsHtml}</ul>
      <table style="width:100%;margin-bottom:16px">
        <tr><td style="padding:4px 0;color:#999">Total</td><td style="padding:4px 0;text-align:right;font-weight:700">${formatNgn(order.total)}</td></tr>
        <tr><td style="padding:4px 0;color:#999">Payment Method</td><td style="padding:4px 0">${escapeHtml(String(order.payment_method || ""))}</td></tr>
      </table>
      ${receiptHtml}
      ${paymentNote}
      <p style="color:#666;font-size:13px">If you have questions about your order, please contact us.</p>
    </div>
  `;
}

interface EmailResult {
  status: "sent" | "already_sent" | "skipped" | "failed";
}

serve(async (req: Request) => {
  const origin = getCorsOrigin(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!resendApiKey) {
    return jsonResponse({ error: "Email service unavailable" }, 500, origin);
  }

  if (!serviceRoleKey) {
    return jsonResponse({ error: "Server configuration error" }, 500, origin);
  }

  if (!FANTIER_ADMIN_EMAIL) {
    return jsonResponse({ error: "Server configuration error" }, 500, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400, origin);
  }

  if (!isRecord(body) || typeof body.ref !== "string") {
    return jsonResponse({ error: "Invalid request" }, 400, origin);
  }

  const ref = body.ref.trim();
  if (ref.length === 0 || ref.length > 100) {
    return jsonResponse({ error: "Invalid request" }, 400, origin);
  }

  if (!/^JP-[a-f0-9]{10}$/i.test(ref)) {
    return jsonResponse({ error: "Invalid request" }, 400, origin);
  }

  const extraKeys = Object.keys(body).filter((k) => k !== "ref");
  if (extraKeys.length > 0) {
    return jsonResponse({ error: "Invalid request" }, 400, origin);
  }

  let order: Record<string, unknown> | null = null;
  try {
    const orderRes = await fetch(
      `${SB_URL}/rest/v1/orders?ref=eq.${encodeURIComponent(ref)}&select=*`,
      {
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          Prefer: "return=representation",
        },
      },
    );
    if (!orderRes.ok) {
      return jsonResponse({ error: "Unable to fetch order" }, 500, origin);
    }
    const data = await orderRes.json();
    if (Array.isArray(data) && data.length > 0) {
      order = data[0];
    }
  } catch {
    console.error("Order fetch error");
    return jsonResponse({ error: "Unable to fetch order" }, 500, origin);
  }

  if (!order) {
    return jsonResponse({ error: "Order not found" }, 404, origin);
  }

  const paymentMethod = order.payment_method as string | undefined;
  const status = order.status as string | undefined;

  const isBankTransfer = paymentMethod === "Bank Transfer";
  const isFlutterwave = paymentMethod === "Flutterwave";
  const isValidStatus = status === "Pending" || status === "Paid";

  if (!isBankTransfer && !isFlutterwave) {
    console.error("Unsupported payment method for ref:", ref);
    return jsonResponse({ error: "Invalid order" }, 400, origin);
  }

  if (!isValidStatus) {
    console.error("Unexpected status for ref:", ref, status);
    return jsonResponse({ error: "Invalid order" }, 400, origin);
  }

  const adminSentAt = order.admin_email_sent_at as string | null | undefined;
  const customerSentAt = order.customer_email_sent_at as string | null | undefined;

  const customerEmail = order.email as string | null | undefined;

  const adminResult: EmailResult = { status: "skipped" };
  const customerResult: EmailResult = { status: "skipped" };

  if (adminSentAt) {
    adminResult.status = "already_sent";
  } else {
    const adminHtml = adminEmailHtml(order);
    try {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Fantier <orders@shopfantier.com>",
          to: FANTIER_ADMIN_EMAIL,
          subject: `New Fantier Order — ${ref}`,
          html: adminHtml,
        }),
      });
      if (resendRes.ok) {
        adminResult.status = "sent";
        try {
          await fetch(`${SB_URL}/rest/v1/orders?ref=eq.${encodeURIComponent(ref)}`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${serviceRoleKey}`,
              apikey: serviceRoleKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ admin_email_sent_at: new Date().toISOString() }),
          });
        } catch {
          console.error("Failed to update admin_email_sent_at for ref:", ref);
        }
      } else {
        adminResult.status = "failed";
        console.error("Resend admin email failed for ref:", ref, resendRes.status);
      }
    } catch {
      adminResult.status = "failed";
      console.error("Resend admin email error for ref:", ref);
    }
  }

  if (customerSentAt) {
    customerResult.status = "already_sent";
  } else if (!customerEmail || !customerEmail.includes("@")) {
    customerResult.status = "skipped";
  } else {
    const customerHtml = customerEmailHtml(order);
    try {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Fantier <orders@shopfantier.com>",
          to: customerEmail,
          subject: `Your Fantier Order — ${ref}`,
          html: customerHtml,
        }),
      });
      if (resendRes.ok) {
        customerResult.status = "sent";
        try {
          await fetch(`${SB_URL}/rest/v1/orders?ref=eq.${encodeURIComponent(ref)}`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${serviceRoleKey}`,
              apikey: serviceRoleKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ customer_email_sent_at: new Date().toISOString() }),
          });
        } catch {
          console.error("Failed to update customer_email_sent_at for ref:", ref);
        }
      } else {
        customerResult.status = "failed";
        console.error("Resend customer email failed for ref:", ref, resendRes.status);
      }
    } catch {
      customerResult.status = "failed";
      console.error("Resend customer email error for ref:", ref);
    }
  }

  return jsonResponse({
    admin: adminResult,
    customer: customerResult,
  }, 200, origin);
});
