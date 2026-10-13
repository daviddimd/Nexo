ALTER TABLE products ADD COLUMN image_data bytea;
ALTER TABLE products ADD CONSTRAINT product_image_size CHECK(image_data IS NULL OR octet_length(image_data)<=2097152);
