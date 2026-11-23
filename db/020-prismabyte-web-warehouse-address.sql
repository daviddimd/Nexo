UPDATE locations AS location
SET address = 'Av. Libertador Bernardo O’Higgins 651, Santiago'
FROM companies AS company
WHERE company.id = location.company_id
  AND company.slug = 'prismabyte'
  AND location.kind = 'WEB'
  AND lower(btrim(location.name)) = 'bodega web'
  AND location.address IS NULL;
