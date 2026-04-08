/*
  # Import Slots Data

  1. Data Import
    - Insert 20 popular slot games with their details
    - RTP ranges from 94% to 96.51%
    - Volatility levels: Low, Medium, High
    - Multiple providers: Play'n GO, Pragmatic Play, NetEnt, etc.
*/

INSERT INTO slots (name, provider, image_url, max_win, volatility, rtp, min_bet, max_bet, theme, release_date, features)
VALUES 
('Leprechaun''s Diamond Dig', 'Play''n GO', 'https://www.bigwinboard.com/wp-content/uploads/2025/05/Leprechauns-Diamond-Dig-slot-feat.jpg', 3000, 'Medium', 96.2, 0.20, 100.00, NULL, '2025-08-25', '{}'),
('Seamen', 'Nolimit City', 'https://mediumrare.imgix.net/1714d1bc91836fbe06463be44271eeb0559bee7576e5810d551a28fd66a46a98', 20000, 'High', 96.04, 0.20, 100.00, NULL, '2025-08-04', '{}'),
('Electric Rush', 'AvatarUX', 'https://www.bigwinboard.com/wp-content/uploads/2025/07/electric-rush-slot-feat.jpg', 10000, 'High', 96.06, 0.20, 100.00, NULL, '2025-08-21', '{}'),
('Book of Madness 2', 'Gamomat', 'https://www.bigwinboard.com/wp-content/uploads/2025/07/Book-of-Madness-2-slot-feat.jpg', 11800, 'High', 96.11, 0.20, 100.00, NULL, '2025-09-01', '{}'),
('Dark Waters 2 Power Combo', 'Just For The Win', 'https://www.bigwinboard.com/wp-content/uploads/2025/07/Dark-Waters-2-Power-Combo-slot-feat.jpg', 6250, 'High', 96, 0.20, 100.00, NULL, '2025-08-25', '{}'),
('Fire Stampede 2', 'Pragmatic Play', 'https://mediumrare.imgix.net/96033185f2fe9b417adaeb25ac49e2c92864c27f27382c729cdc19abb714898b', 8300, 'High', 96.51, 0.20, 100.00, NULL, '2025-08-24', '{}'),
('Fire Joker Blitz', 'Play''n GO', 'https://mediumrare.imgix.net/a163540d42af8d46c2efb744c5fff28b50a27768e7f9413e8c51cee5ae382119', 6000, 'Medium', 96.29, 0.20, 100.00, NULL, '2025-08-27', '{}'),
('Spinnin'' Records Raving Reels', 'Play''n GO', 'https://www.bigwinboard.com/wp-content/uploads/2025/07/Spinnin-Records-Raving-Reels-slot-feat.jpg', 3000, 'Medium', 96.2, 0.20, 100.00, NULL, '2025-08-20', '{}'),
('5 Flaming Dollars', '4ThePlayer', 'https://www.bigwinboard.com/wp-content/uploads/2025/07/5-flaming-dollars-slot-feat.jpg', 5000, 'High', 94, 0.20, 100.00, NULL, '2025-07-23', '{}'),
('Fire Pig Push Ways', 'Push Gaming', 'https://www.bigwinboard.com/wp-content/uploads/2025/05/Fire-Pig-Push-Ways-slot-feat.jpg', 4941, 'Medium', 96.27, 0.20, 100.00, NULL, '2025-08-12', '{}'),
('Spellmaster', 'Pragmatic Play', 'https://www.bigwinboard.com/wp-content/uploads/2025/05/spellmaster-slot-feat.jpg', 40000, 'High', 96.5, 0.20, 100.00, NULL, '2025-08-17', '{}'),
('13th Trial Hercules Abyssways', 'Play''n GO', 'https://www.bigwinboard.com/wp-content/uploads/2025/05/13th-Trial-Hercules-Abyssways-slot-feat.jpg', 60000, 'High', 96.2, 0.20, 100.00, NULL, '2025-08-13', '{}'),
('Pirate Bonanza 2', 'Backseat Gaming', 'https://mediumrare.imgix.net/39133d5597e6d48f36578da75436d731152aaa3b3309c199389d6aa3119afb3e', 20000, 'High', 96.32, 0.20, 100.00, NULL, '2025-08-04', '{}'),
('Miami Mayhem', 'Hacksaw Gaming', 'https://mediumrare.imgix.net/156279d1e04bcfd0c2692d46de3434704196a1b79489c2bf61f690f8f260f6a2', 15000, 'High', 96.35, 0.20, 100.00, NULL, '2025-08-27', '{}'),
('Piggy Riches 3 Hog Heaven', 'NetEnt', 'https://www.bigwinboard.com/wp-content/uploads/2025/05/Piggy-Riches-3-Hog-Heaven-slot-feat.jpg', 10387, 'High', 96.06, 0.20, 100.00, NULL, '2025-08-25', '{}'),
('Ice Mints', 'Pragmatic Play', 'https://www.bigwinboard.com/wp-content/uploads/2025/05/ice-mints-slot-feat.jpg', 10000, 'High', 96.5, 0.20, 100.00, NULL, '2025-08-13', '{}'),
('Conquer Babylon', 'Relax Gaming', 'https://mediumrare.imgix.net/f07568dc1f05eaccc7841d573c6a8aaaffab9cf021f16308281de3c5a6d25122', 15000, 'Medium', 96.1, 0.20, 100.00, NULL, '2025-08-04', '{}'),
('Book of Whispers', 'Trusty Gaming', 'https://www.bigwinboard.com/wp-content/uploads/2025/06/Book-of-Whispers-slot-feat.jpg', 5000, 'High', 96.24, 0.20, 100.00, NULL, '2025-08-31', '{}'),
('Deadeye', 'ELK Studios', 'https://www.bigwinboard.com/wp-content/uploads/2025/07/Deadeye-slot-feat.jpg', 10000, 'High', 94, 0.20, 100.00, NULL, '2025-09-23', '{}'),
('Take the Money', 'Red Tiger', 'https://www.bigwinboard.com/wp-content/uploads/2025/07/Take-the-Money-slot-4.jpg', 10000, 'High', 96.11, 0.20, 100.00, NULL, '2025-09-03', '{}');
