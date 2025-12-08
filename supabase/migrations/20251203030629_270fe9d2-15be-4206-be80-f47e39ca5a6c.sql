-- Delete duplicate products, keeping the one with the most recent updated_at
DELETE FROM products p1
WHERE id NOT IN (
  SELECT DISTINCT ON (barcode) id
  FROM products
  ORDER BY barcode, updated_at DESC NULLS LAST
);

-- Delete duplicate quick_quantities, keeping the one with the most recent created_at
DELETE FROM quick_quantities q1
WHERE id NOT IN (
  SELECT DISTINCT ON (label) id
  FROM quick_quantities
  ORDER BY label, created_at DESC NULLS LAST
);

-- Now add unique constraints
ALTER TABLE public.products ADD CONSTRAINT products_barcode_key UNIQUE (barcode);
ALTER TABLE public.quick_quantities ADD CONSTRAINT quick_quantities_label_key UNIQUE (label);