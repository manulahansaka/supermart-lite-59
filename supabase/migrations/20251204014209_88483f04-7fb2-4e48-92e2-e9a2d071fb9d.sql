-- Delete duplicate settings, keeping the one with the most recent updated_at
DELETE FROM settings s1
WHERE id NOT IN (
  SELECT DISTINCT ON (store_name) id
  FROM settings
  ORDER BY store_name, updated_at DESC NULLS LAST
);

-- Add unique constraint
ALTER TABLE public.settings ADD CONSTRAINT settings_store_name_key UNIQUE (store_name);