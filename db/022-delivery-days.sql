-- Plazo de entrega por comuna, en días hábiles. Es opcional: sin plazo la tienda no promete fecha.
-- El pedido guarda una copia del plazo vigente al comprar, para que un cambio posterior de la tarifa
-- no altere lo que se le prometió al cliente.
ALTER TABLE shipping_rates
  ADD COLUMN delivery_days_min integer,
  ADD COLUMN delivery_days_max integer,
  ADD CONSTRAINT shipping_rate_delivery_days CHECK (
    (delivery_days_min IS NULL AND delivery_days_max IS NULL)
    OR (delivery_days_min BETWEEN 0 AND 60 AND delivery_days_max BETWEEN delivery_days_min AND 60));
ALTER TABLE orders
  ADD COLUMN delivery_days_min integer,
  ADD COLUMN delivery_days_max integer,
  ADD CONSTRAINT order_delivery_days CHECK (
    (delivery_days_min IS NULL AND delivery_days_max IS NULL)
    OR (delivery_days_min BETWEEN 0 AND 60 AND delivery_days_max BETWEEN delivery_days_min AND 60));
