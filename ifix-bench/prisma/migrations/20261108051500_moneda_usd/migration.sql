-- Cambia la moneda del taller a dólar estadounidense (pedido del usuario en la fase 2).
UPDATE "Setting" SET "value" = 'USD' WHERE "key" = 'moneda';
