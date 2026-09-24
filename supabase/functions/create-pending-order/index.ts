import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SB_URL = "https://mbkanieqhxryeksalrti.supabase.co";

const CUSTOM_FEE = 5000;

const JERSEY_CATEGORIES = ["national", "club", "retro", "kids"];
const SUPPORTED_CATEGORIES = new Set([...JERSEY_CATEGORIES, "frame"]);

const SIZES_DEF = ["S", "M", "L", "XL", "XXL", "XXXL"];

const ALLOWED_ORIGINS = [
  "http://localhost:8000",
  "https://shopfantier.com",
  "https://www.shopfantier.com",
];

type PaymentMethod = "Flutterwave" | "Bank Transfer";

type Product = {
  id: number;
  price: number;
  category: string;
  sizes: string[] | undefined;
  in_stock: boolean;
};

type ValidatedItem = {
  id: number;
  size: string;
  customOn: boolean;
  cName?: string;
  cNum?: string;
  price: number;
  quantity: number;
};

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return value === "Flutterwave" || value === "Bank Transfer";
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function requiredString(
  body: Record<string, unknown>,
  key: string,
  minLength: number,
  maxLength: number,
): string | null {
  const value = body[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < minLength || trimmed.length > maxLength) return null;
  return trimmed;
}

function generateRef(): string {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return "JP-" + Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase().slice(0, 10);
}

function parseReceiptUrl(
  value: unknown,
  paymentMethod: PaymentMethod,
): string | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  if (paymentMethod !== "Bank Transfer") return "invalid";
  if (typeof value !== "string") return "invalid";
  const prefix = `${SB_URL}/storage/v1/object/public/receipts/`;
  if (!value.startsWith(prefix)) return "invalid";
  const rest = value.slice(prefix.length);
  if (
    !rest ||
    rest.includes("/") ||
    rest.includes("..") ||
    rest.includes("?") ||
    rest.includes("#") ||
    rest.length > 200 ||
    !/^receipt_\d+\.[A-Za-z0-9]+$/.test(rest)
  ) {
    return "invalid";
  }
  return value;
}

function isProduct(value: unknown): value is Product {
  if (!isRecord(value)) return false;
  return (
    isPositiveInteger(value.id) &&
    typeof value.price === "number" &&
    Number.isSafeInteger(value.price) &&
    value.price > 0 &&
    value.price < 10000000 &&
    typeof value.category === "string" &&
    SUPPORTED_CATEGORIES.has(value.category) &&
    (value.sizes === undefined || (Array.isArray(value.sizes) && value.sizes.every(size => typeof size === "string" && size.length > 0))) &&
    value.in_stock === true
  );
}

serve(async (req: Request) => {
  const origin = getCorsOrigin(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400, origin);
  }

  if (!isRecord(body)) {
    return jsonResponse({ error: "Invalid request" }, 400, origin);
  }

  const paymentMethod = body.payment_method === undefined ? "Flutterwave" : body.payment_method;
  if (!isPaymentMethod(paymentMethod)) {
    return jsonResponse({ error: "Invalid payment method" }, 400, origin);
  }

  const itemsValue = body.items;
  if (!Array.isArray(itemsValue) || itemsValue.length === 0) {
    return jsonResponse({ error: "Items array is required" }, 400, origin);
  }

  if (itemsValue.length > 50) {
    return jsonResponse({ error: "Too many cart items" }, 400, origin);
  }

  const customerName = requiredString(body, "customer_name", 1, 100);
  const phone = requiredString(body, "phone", 1, 20);
  const address = requiredString(body, "address", 1, 200);
  const city = requiredString(body, "city", 1, 100);
  if (!customerName || !phone || !address || !city) {
    return jsonResponse({ error: "Invalid customer details" }, 400, origin);
  }

  let email: string | null = null;
  if (body.email !== undefined && body.email !== null && body.email !== "") {
    if (typeof body.email !== "string") {
      return jsonResponse({ error: "Invalid customer details" }, 400, origin);
    }
    const normalizedEmail = body.email.trim();
    if (
      normalizedEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      return jsonResponse({ error: "Invalid customer details" }, 400, origin);
    }
    email = normalizedEmail;
  }

  const rawNote = body.note;
  let note: string | null = null;
  if (rawNote !== undefined && rawNote !== null && rawNote !== "") {
    if (typeof rawNote !== "string") {
      return jsonResponse({ error: "Invalid note" }, 400, origin);
    }
    const trimmedNote = rawNote.trim();
    if (trimmedNote.length > 1000) {
      return jsonResponse({ error: "Note too long (max 1000 characters)" }, 400, origin);
    }
    note = trimmedNote;
  }

  const receiptUrl = parseReceiptUrl(body.receipt_url, paymentMethod);
  if (receiptUrl === "invalid") {
    return jsonResponse({ error: "Invalid receipt URL" }, 400, origin);
  }

  const rawItems: Record<string, unknown>[] = [];
  const productIds: number[] = [];
  for (const item of itemsValue) {
    if (!isRecord(item) || !isPositiveInteger(item.id)) {
      return jsonResponse({ error: "Invalid cart item" }, 400, origin);
    }
    rawItems.push(item);
    productIds.push(item.id);
  }

  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    return jsonResponse({ error: "Server configuration error" }, 500, origin);
  }

  let productsData: unknown;
  try {
    const idList = productIds.join(",");
    const productsRes = await fetch(
      `${SB_URL}/rest/v1/products?id=in.(${idList})&select=id,price,category,sizes,in_stock,description`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!productsRes.ok) {
      console.error("Products fetch failed", productsRes.status);
      return jsonResponse({ error: "Failed to fetch products" }, 502, origin);
    }
    productsData = await productsRes.json();
  } catch {
    console.error("Products fetch error");
    return jsonResponse({ error: "Failed to fetch products" }, 502, origin);
  }

  if (!Array.isArray(productsData) || productsData.length === 0) {
    return jsonResponse({ error: "No valid products found" }, 400, origin);
  }

  const productMap = new Map<string, Product>();
  for (const product of productsData) {
    if (!isProduct(product)) {
      return jsonResponse({ error: "Invalid product data" }, 502, origin);
    }
    productMap.set(String(product.id), product);
  }

  const validatedItems: ValidatedItem[] = [];
  let subtotal = 0;

  for (const item of rawItems) {
    const productId = item.id as number;
    const product = productMap.get(String(productId));
    if (!product) {
      return jsonResponse({ error: "Product not found" }, 400, origin);
    }

    const quantityValue = item.quantity === undefined ? 1 : item.quantity;
    if (!isPositiveInteger(quantityValue) || quantityValue > 99) {
      return jsonResponse({ error: "Invalid quantity" }, 400, origin);
    }
    const quantity = quantityValue;

    const sizeValue = item.size === undefined ? undefined : item.size;
    if (sizeValue !== undefined && typeof sizeValue !== "string") {
      return jsonResponse({ error: "Invalid size" }, 400, origin);
    }

    const productSizes = product.sizes === undefined ? SIZES_DEF : product.sizes;
    const isJersey = JERSEY_CATEGORIES.includes(product.category);
    let size = sizeValue;

    if (isJersey) {
      if (typeof size !== "string" || size.length === 0 || !productSizes.includes(size)) {
        return jsonResponse({ error: "Invalid size" }, 400, origin);
      }
    } else {
      size = size === undefined ? "One Size" : size;
      if (size.length === 0) {
        return jsonResponse({ error: "Invalid size" }, 400, origin);
      }
    }

    const customOnValue = item.customOn === undefined ? false : item.customOn;
    if (typeof customOnValue !== "boolean") {
      return jsonResponse({ error: "Invalid customization data" }, 400, origin);
    }
    const customOn = customOnValue;

    let cName: string | undefined;
    let cNum: string | undefined;
    if (customOn) {
      if (!isJersey) {
        return jsonResponse({ error: "Invalid customization data" }, 400, origin);
      }
      if (typeof item.cName !== "string") {
        return jsonResponse({ error: "Invalid customization data" }, 400, origin);
      }
      const normalizedCName = item.cName.trim();
      if (normalizedCName.length < 1 || normalizedCName.length > 14) {
        return jsonResponse({ error: "Invalid customization data" }, 400, origin);
      }

      if (typeof item.cNum !== "string") {
        return jsonResponse({ error: "Invalid customization data" }, 400, origin);
      }
      const normalizedCNum = item.cNum.trim();
      if (!/^[0-9]{1,2}$/.test(normalizedCNum)) {
        return jsonResponse({ error: "Invalid customization data" }, 400, origin);
      }

      cName = normalizedCName;
      cNum = normalizedCNum;
    }

    const basePrice = product.price;
    const itemPrice = basePrice + (customOn ? CUSTOM_FEE : 0);
    if (!Number.isSafeInteger(itemPrice) || itemPrice >= 10000000) {
      return jsonResponse({ error: "Invalid product price" }, 502, origin);
    }

    validatedItems.push({
      id: productId,
      size,
      customOn,
      cName,
      cNum,
      price: itemPrice,
      quantity,
    });

    subtotal += itemPrice * quantity;
    if (!Number.isSafeInteger(subtotal)) {
      return jsonResponse({ error: "Invalid order total" }, 400, origin);
    }
  }

  const total = subtotal;
  if (!Number.isSafeInteger(total) || total <= 0) {
    return jsonResponse({ error: "Invalid order total" }, 400, origin);
  }

  const ref = generateRef();
  const orderData = {
    ref,
    customer_name: customerName,
    phone,
    address,
    city,
    zone: null,
    zone_fee: null,
    items: validatedItems,
    subtotal,
    total,
    note,
    payment_method: paymentMethod,
    receipt_url: receiptUrl,
    status: "Pending",
    flutterwave_transaction_id: null,
    email,
  };

  let orderRes: Response;
  try {
    orderRes = await fetch(`${SB_URL}/rest/v1/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(orderData),
    });
  } catch {
    console.error("Order insert network error");
    return jsonResponse({ error: "Failed to create order" }, 502, origin);
  }

  let orderResult: unknown;
  try {
    orderResult = await orderRes.json();
  } catch {
    console.error("Order insert response parse failed", orderRes.status);
    return jsonResponse({ error: "Failed to create order" }, 502, origin);
  }

  if (!orderRes.ok) {
    console.error("Order insert failed", orderRes.status, orderResult);
    return jsonResponse({ error: "Failed to create order" }, 502, origin);
  }

  const inserted = Array.isArray(orderResult) ? orderResult[0] : orderResult;

  return jsonResponse({
    created: true,
    ref,
    order_id: isRecord(inserted) ? inserted.id : undefined,
    total,
    currency: "NGN",
  }, 200, origin);
});
