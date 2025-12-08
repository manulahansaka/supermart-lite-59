-- Delete duplicate sales, keeping the one with the most recent synced_at
DELETE FROM sales s1
WHERE id NOT IN (
  SELECT DISTINCT ON (device_id, local_id) id
  FROM sales
  ORDER BY device_id, local_id, synced_at DESC NULLS LAST
);

-- Delete duplicate expenses, keeping the one with the most recent synced_at  
DELETE FROM expenses e1
WHERE id NOT IN (
  SELECT DISTINCT ON (device_id, local_id) id
  FROM expenses
  ORDER BY device_id, local_id, synced_at DESC NULLS LAST
);

-- Now add unique constraints
ALTER TABLE public.sales ADD CONSTRAINT sales_device_local_key UNIQUE (device_id, local_id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_device_local_key UNIQUE (device_id, local_id);