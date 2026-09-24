ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS note text;
