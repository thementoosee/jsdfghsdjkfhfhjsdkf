/*
  # Add Default Casinos

  1. Changes
    - Insert default casinos shown in the UI mockup
    - Casinos: Leon, Empire Drop, Stelario, RioAce, 1xBit, 96
*/

INSERT INTO casinos (name, thumbnail_url, is_active, order_index) VALUES
  ('Leon', 'https://i.imgur.com/wVqLzwT.png', false, 0),
  ('Empire Drop', 'https://i.imgur.com/wVqLzwT.png', false, 1),
  ('Stelario', 'https://i.imgur.com/wVqLzwT.png', false, 2),
  ('RioAce', 'https://i.imgur.com/wVqLzwT.png', false, 3),
  ('1xBit', 'https://i.imgur.com/wVqLzwT.png', false, 4),
  ('96', 'https://i.imgur.com/wVqLzwT.png', false, 5)
ON CONFLICT DO NOTHING;