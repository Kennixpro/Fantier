-- ============================================================================
-- Fantier — Add email column to orders table
-- ============================================================================
-- Purpose:
--   Adds the `email` column to public.orders.
--   Required by the create-pending-order Edge Function which collects
--   the customer's email address for receipt delivery.
--
-- This migration runs after the main secure-payment migration
-- (20260907_secure_flutterwave_payment.sql) has already been applied.
-- ============================================================================

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS email text;

COMMENT ON COLUMN public.orders.email IS 'Customer email for receipt delivery (optional)';
