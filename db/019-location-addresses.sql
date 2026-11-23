ALTER TABLE locations ADD COLUMN address text
  CHECK (char_length(btrim(address)) BETWEEN 1 AND 240);

-- Public landmarks serve as reference addresses for the academic demo.
UPDATE locations AS location
SET address = demo.address
FROM companies AS company,
  (VALUES
    ('recoleta', 'Pío Nono 450, Recoleta'),
    ('vitacura', 'Av. Bicentenario 3800, Vitacura'),
    ('santiago centro', 'Plaza de Armas s/n, Santiago'),
    ('talca', '1 Norte 797, Talca'),
    ('curicó', 'Carmen 560, Curicó'),
    ('concepción', 'O’Higgins 525, Concepción')
  ) AS demo(city, address)
WHERE company.id = location.company_id
  AND company.slug = 'prismabyte'
  AND location.kind = 'STORE'
  AND location.address IS NULL
  AND lower(btrim(location.name)) IN (demo.city, 'sucursal ' || demo.city);
