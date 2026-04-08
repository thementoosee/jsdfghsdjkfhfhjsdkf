/*
  # Import Overlays Data

  1. Data Import
    - Insert sample overlays for different types
    - bar, background, bonus_hunt, bonus_opening, chill, chatbox, chat, alerts
    - fever_champions, fever_bracket, fever_groups, main_stream
*/

INSERT INTO overlays (type, name, config, is_active)
VALUES 
('bar', 'Default Bar', '{"opacity": 0.8, "position": "bottom"}', true),
('background', 'Dark Background', '{"color": "#1a1a1a", "opacity": 0.9}', true),
('bonus_hunt', 'Bonus Hunt Tracker', '{"showStats": true, "showHistory": true}', true),
('bonus_opening', 'Opening Animation', '{"duration": 2, "animate": true}', false),
('chill', 'Chill Mode', '{"bgColor": "#f5f5f5", "fontSize": 14}', false),
('chatbox', 'Chat Display', '{"maxMessages": 50, "fontSize": 12}', true),
('chat', 'Chat Interface', '{"width": 300, "height": 400}', true),
('alerts', 'Alert Notifications', '{"position": "top-right", "duration": 5}', true),
('fever_champions', 'Fever Champions', '{"layout": "grid", "cols": 3}', false),
('fever_bracket', 'Fever Bracket', '{"rounds": 4, "mode": "tournament"}', false),
('fever_groups', 'Fever Groups', '{"groupSize": 5, "showRanking": true}', false),
('main_stream', 'Main Stream Display', '{"videoSize": "large", "showChat": true}', false);
