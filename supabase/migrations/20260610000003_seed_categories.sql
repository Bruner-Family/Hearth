-- ADR-001 §2.5 — seeded category catalog with suggested lifespans
-- (common industry estimates; per-item override lives on items).

insert into public.item_categories (name, icon, default_lifespan_years, sort_order) values
  ('Roof (asphalt shingle)', '🏠', 20, 10),
  ('HVAC – furnace',         '🔥', 18, 20),
  ('HVAC – A/C condenser',   '❄️', 15, 30),
  ('Water heater (tank)',    '🚿', 11, 40),
  ('Windows',                '🪟', 25, 50),
  ('Sprinkler/irrigation',   '💧', 20, 60),
  ('Cabinets',               '🗄️', 30, 70),
  ('Dishwasher',             '🍽️', 10, 80),
  ('Refrigerator',           '🧊', 13, 90),
  ('Washer',                 '🧺', 11, 100),
  ('Dryer',                  '👕', 13, 110),
  ('Range/oven',             '🍳', 14, 120),
  ('Garage door opener',     '🚗', 12, 130),
  ('Sump pump',              '🕳️', 10, 140),
  ('Other',                  '📦', null, 150);
