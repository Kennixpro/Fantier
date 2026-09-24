-- Allow delivery to be arranged after checkout (no fee in order total).
ALTER TABLE public.orders
  ALTER COLUMN zone DROP NOT NULL;

ALTER TABLE public.orders
  ALTER COLUMN zone_fee DROP NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS note text;
