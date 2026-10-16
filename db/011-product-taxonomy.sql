CREATE TABLE categories (
 id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id),
 parent_id uuid, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 slug text NOT NULL CHECK(slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
 attributes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(attributes)='array'),
 UNIQUE(company_id,id), UNIQUE(company_id,slug), CHECK(parent_id IS NULL OR parent_id<>id),
 FOREIGN KEY(company_id,parent_id) REFERENCES categories(company_id,id)
);
ALTER TABLE products ADD COLUMN category_id uuid;
ALTER TABLE products ADD COLUMN specifications jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(specifications)='object');
ALTER TABLE products ADD CONSTRAINT product_category_fk FOREIGN KEY(company_id,category_id) REFERENCES categories(company_id,id);
CREATE INDEX categories_parent ON categories(company_id,parent_id);
CREATE INDEX products_category ON products(company_id,category_id);
CREATE INDEX products_specifications ON products USING gin(specifications jsonb_path_ops);
-- Parent links stay fixed; names and attribute values can be edited separately in future versions.
CREATE FUNCTION guard_category_structure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.id IS DISTINCT FROM OLD.id OR NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
  RAISE EXCEPTION 'Category identity and parent are immutable';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER category_structure BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION guard_category_structure();
