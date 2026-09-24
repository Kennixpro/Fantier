-- ============================================================================
-- Fantier — Secure Flutterwave Payment Migration
-- ============================================================================
-- Purpose:
--   1. Add flutterwave_transaction_id column for payment/order binding
--   2. Add separate admin/customer email-sent tracking columns
--   3. Add UNIQUE constraint on flutterwave_transaction_id
--      (this also creates the index needed for fast transaction lookups)
--   4. Restrict anonymous INSERT to bank-transfer Pending orders only
--      (Flutterwave orders must be created via Edge Functions using service_role)
--
-- Security model:
--   - Browser can ONLY insert orders with status='Pending' AND payment_method='Bank Transfer'
--   - Browser CANNOT insert Flutterwave orders directly
--   - Browser CANNOT set status='Paid' directly
--   - Edge Functions use service_role to bypass RLS for Flutterwave order creation/update
--   - The UNIQUE constraint on flutterwave_transaction_id prevents the same
--     Flutterwave transaction from being used for multiple orders
--
-- Dependencies:
--   - This migration assumes the public.orders table already exists with:
--     id (bigint, PK), ref (text, UNIQUE), customer_name, phone, address, city,
--     zone, zone_fee (numeric, default 0), items (jsonb), subtotal (numeric),
--     total (numeric), payment_method, receipt_url, status (text, default 'Pending'),
--     created_at (timestamptz, default now())
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
ADD COLUMN flutterwave_transaction_id text;

ALTER TABLE public.orders
ADD COLUMN admin_email_sent_at timestamptz;

ALTER TABLE public.orders
ADD COLUMN customer_email_sent_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. UNIQUE constraint on flutterwave_transaction_id
--    This creates an index automatically (orders_flutterwave_transaction_id_key)
--    No separate index needed for transaction_id lookups.
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
ADD CONSTRAINT orders_flutterwave_transaction_id_key
UNIQUE (flutterwave_transaction_id);

-- ---------------------------------------------------------------------------
-- 3. RLS: Restrict anonymous INSERT to bank-transfer Pending orders only
-- ---------------------------------------------------------------------------

-- Drop the existing permissive policy
DROP POLICY IF EXISTS "Customer insert order" ON public.orders;

-- Create a restricted policy that only allows anonymous users to insert
-- bank-transfer orders with status='Pending'.
-- Flutterwave orders MUST be created via Edge Functions using service_role.
CREATE POLICY "Customer insert pending bank transfer order"
ON public.orders
FOR INSERT
TO anon
WITH CHECK (
  status = 'Pending'
  AND payment_method = 'Bank Transfer'
);

-- ---------------------------------------------------------------------------
-- 4. Optional: Add indexes for admin dashboard performance
--    These are NOT duplicate indexes — they serve different query patterns.
--    The UNIQUE constraint already indexes flutterwave_transaction_id.
-- ---------------------------------------------------------------------------

-- Index for admin dashboard: filter/sort by status
CREATE INDEX idx_orders_status
ON public.orders (status);

-- Index for admin dashboard: sort by created_at descending
CREATE INDEX idx_orders_created_at
ON public.orders (created_at DESC);

-- Index for admin dashboard: filter by payment_method
CREATE INDEX idx_orders_payment_method
ON public.orders (payment_method);