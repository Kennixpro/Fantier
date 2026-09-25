import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_USER_ID = Deno.env.get("FANTIER_ADMIN_USER_ID")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

 /*
 * STEP 1:
 * Require the access token from the logged-in Fantier admin.
 */
const authHeader = req.headers.get("Authorization");

if (!authHeader?.startsWith("Bearer ")) {
  return jsonResponse({ error: "Unauthorized" }, 401);
}

const accessToken = authHeader.slice(7).trim();

if (!accessToken) {
  return jsonResponse({ error: "Unauthorized" }, 401);
}

/*
 * STEP 2:
 * Ask Supabase Auth who owns this access token.
 */
const userResponse = await fetch(`${SB_URL}/auth/v1/user`, {
  headers: {
    Authorization: `Bearer ${accessToken}`,
    apikey: SERVICE_ROLE_KEY,
  },
});

if (!userResponse.ok) {
  return jsonResponse(
    { error: "Invalid or expired admin session" },
    401
  );
}

const user = await userResponse.json();

if (!user?.id) {
  return jsonResponse({ error: "Unauthorized" }, 401);
}

/*
 * Only the Fantier admin account is allowed to
 * perform privileged payment confirmation.
 */
if (!ADMIN_USER_ID) {
  console.error("FANTIER_ADMIN_USER_ID is not configured");

  return jsonResponse(
    { error: "Server configuration error" },
    500
  );
}

if (user.id !== ADMIN_USER_ID) {
  console.error(
    "Unauthorized payment confirmation attempt:",
    user.id
  );

  return jsonResponse({ error: "Forbidden" }, 403);
}

/*
 * STEP 3:
 * Read and validate the order reference.
 */
let body: Record<string, unknown>;

try {
  body = await req.json();
} catch {
  return jsonResponse({ error: "Invalid request" }, 400);
}

const ref =
  typeof body.ref === "string"
    ? body.ref.trim()
    : "";

if (!/^JP-[a-f0-9]{10}$/i.test(ref)) {
  return jsonResponse(
    { error: "Invalid order reference" },
    400
  );
}

  /*
   * STEP 4:
   * Fetch the real order from Supabase.
   * We never trust payment information sent by the browser.
   */
  const orderResponse = await fetch(
    `${SB_URL}/rest/v1/orders?ref=eq.${encodeURIComponent(ref)}&select=id,ref,status,payment_method,email`,
    {
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
    },
  );

  if (!orderResponse.ok) {
    console.error("Unable to fetch order:", await orderResponse.text());
    return jsonResponse({ error: "Unable to fetch order" }, 500);
  }

  const orders = await orderResponse.json();

  if (!Array.isArray(orders) || orders.length !== 1) {
    return jsonResponse({ error: "Order not found" }, 404);
  }

  const order = orders[0];

  /*
   * Only manual bank-transfer orders should pass through
   * this confirmation endpoint.
   */
  if (order.payment_method !== "Bank Transfer") {
    return jsonResponse(
      { error: "Only bank transfer orders can be manually confirmed" },
      400,
    );
  }

  if (order.status === "Paid") {
    return jsonResponse({
      success: true,
      already_paid: true,
      ref,
      status: "Paid",
    });
  }

  if (order.status !== "Pending") {
    return jsonResponse(
      { error: `Order cannot be confirmed from status: ${order.status}` },
      409,
    );
  }

  /*
   * STEP 5:
   * Mark the order as Paid.
   */
  const updateResponse = await fetch(
    `${SB_URL}/rest/v1/orders?ref=eq.${encodeURIComponent(ref)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        status: "Paid",
      }),
    },
  );

  if (!updateResponse.ok) {
    console.error("Unable to update order:", await updateResponse.text());
    return jsonResponse({ error: "Unable to confirm payment" }, 500);
  }

  const updated = await updateResponse.json();

  return jsonResponse({
    success: true,
    ref,
    status: "Paid",
    order: Array.isArray(updated) ? updated[0] : updated,
  });
});