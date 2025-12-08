-- Change stock and min_stock columns from integer to numeric to support decimal values
ALTER TABLE public.products 
  ALTER COLUMN stock TYPE numeric USING stock::numeric,
  ALTER COLUMN min_stock TYPE numeric USING min_stock::numeric;