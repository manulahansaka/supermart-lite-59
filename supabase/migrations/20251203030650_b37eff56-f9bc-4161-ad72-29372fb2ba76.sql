-- Add unique constraint on customers.phone
ALTER TABLE public.customers ADD CONSTRAINT customers_phone_key UNIQUE (phone);