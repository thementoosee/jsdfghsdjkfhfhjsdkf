/*
  # Create Bonus Opening System
  
  1. New Tables
    - `bonus_openings`
      - `id` (uuid, primary key)
      - `name` (text) - Opening session name
      - `status` (text) - 'active' or 'completed'
      - `total_investment` (numeric) - Total amount invested
      - `total_payout` (numeric) - Total amount won
      - `profit_loss` (numeric) - Calculated profit/loss
      - `current_multiplier` (numeric) - Current overall multiplier
      - `current_break_even` (numeric) - Break even multiplier needed
      - `streamer_name` (text) - Name of the streamer
      - `brand_logo_id` (uuid) - Reference to brand logo
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `bonus_opening_items`
      - `id` (uuid, primary key)
      - `bonus_opening_id` (uuid) - Reference to bonus_openings
      - `slot_name` (text)
      - `slot_image` (text) - URL to slot image
      - `payment` (numeric) - Amount paid for the bonus
      - `payout` (numeric) - Amount won from opening
      - `multiplier` (numeric) - Calculated multiplier (payout/payment)
      - `status` (text) - 'pending' or 'opened'
      - `super_bonus` (boolean) - Whether this is a super bonus
      - `order_index` (integer) - Display order
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on both tables
    - Add policies for public read access
    - Add policies for authenticated users to manage their openings
  
  3. Functions
    - Trigger to auto-calculate totals and multipliers
    - Trigger to update timestamps
*/

-- Create bonus_openings table
CREATE TABLE IF NOT EXISTS bonus_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  total_investment numeric DEFAULT 0,
  total_payout numeric DEFAULT 0,
  profit_loss numeric DEFAULT 0,
  current_multiplier numeric DEFAULT 0,
  current_break_even numeric DEFAULT 0,
  streamer_name text DEFAULT '',
  brand_logo_id uuid REFERENCES brand_logos(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create bonus_opening_items table
CREATE TABLE IF NOT EXISTS bonus_opening_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bonus_opening_id uuid NOT NULL REFERENCES bonus_openings(id) ON DELETE CASCADE,
  slot_name text NOT NULL,
  slot_image text DEFAULT '',
  payment numeric NOT NULL DEFAULT 0,
  payout numeric DEFAULT 0,
  multiplier numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'opened')),
  super_bonus boolean DEFAULT false,
  order_index integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE bonus_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_opening_items ENABLE ROW LEVEL SECURITY;

-- Policies for bonus_openings
CREATE POLICY "Anyone can view bonus openings"
  ON bonus_openings FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert bonus openings"
  ON bonus_openings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update bonus openings"
  ON bonus_openings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete bonus openings"
  ON bonus_openings FOR DELETE
  TO authenticated
  USING (true);

-- Policies for bonus_opening_items
CREATE POLICY "Anyone can view bonus opening items"
  ON bonus_opening_items FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert bonus opening items"
  ON bonus_opening_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update bonus opening items"
  ON bonus_opening_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete bonus opening items"
  ON bonus_opening_items FOR DELETE
  TO authenticated
  USING (true);

-- Function to update bonus_opening totals
CREATE OR REPLACE FUNCTION update_bonus_opening_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_total_investment numeric;
  v_total_payout numeric;
  v_profit_loss numeric;
  v_current_multiplier numeric;
  v_current_break_even numeric;
BEGIN
  -- Calculate totals from all items
  SELECT 
    COALESCE(SUM(payment), 0),
    COALESCE(SUM(payout), 0)
  INTO v_total_investment, v_total_payout
  FROM bonus_opening_items
  WHERE bonus_opening_id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id);
  
  -- Calculate profit/loss
  v_profit_loss := v_total_payout - v_total_investment;
  
  -- Calculate current multiplier
  IF v_total_investment > 0 THEN
    v_current_multiplier := v_total_payout / v_total_investment;
  ELSE
    v_current_multiplier := 0;
  END IF;
  
  -- Calculate current break even multiplier
  IF v_total_investment > 0 AND v_total_payout < v_total_investment THEN
    v_current_break_even := v_total_investment / v_total_payout;
  ELSE
    v_current_break_even := 0;
  END IF;
  
  -- Update the bonus_opening record
  UPDATE bonus_openings
  SET 
    total_investment = v_total_investment,
    total_payout = v_total_payout,
    profit_loss = v_profit_loss,
    current_multiplier = v_current_multiplier,
    current_break_even = v_current_break_even,
    updated_at = now()
  WHERE id = COALESCE(NEW.bonus_opening_id, OLD.bonus_opening_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for bonus_opening_items
DROP TRIGGER IF EXISTS trigger_update_bonus_opening_totals ON bonus_opening_items;
CREATE TRIGGER trigger_update_bonus_opening_totals
  AFTER INSERT OR UPDATE OR DELETE ON bonus_opening_items
  FOR EACH ROW
  EXECUTE FUNCTION update_bonus_opening_totals();

-- Function to update item multiplier
CREATE OR REPLACE FUNCTION update_bonus_opening_item_multiplier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment > 0 THEN
    NEW.multiplier := NEW.payout / NEW.payment;
  ELSE
    NEW.multiplier := 0;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for item multiplier
DROP TRIGGER IF EXISTS trigger_update_bonus_opening_item_multiplier ON bonus_opening_items;
CREATE TRIGGER trigger_update_bonus_opening_item_multiplier
  BEFORE INSERT OR UPDATE ON bonus_opening_items
  FOR EACH ROW
  EXECUTE FUNCTION update_bonus_opening_item_multiplier();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bonus_opening_items_opening_id ON bonus_opening_items(bonus_opening_id);
CREATE INDEX IF NOT EXISTS idx_bonus_opening_items_status ON bonus_opening_items(status);
CREATE INDEX IF NOT EXISTS idx_bonus_openings_status ON bonus_openings(status);