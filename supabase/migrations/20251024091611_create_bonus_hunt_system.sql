/*
  # Bonus Hunt System

  ## Overview
  Complete system for managing bonus hunts - tracking multiple slot bonuses bought,
  their outcomes, break-even calculations, and real-time overlay display.

  ## New Tables

  ### `bonus_hunts`
  Main bonus hunt sessions
  - `id` (uuid, primary key)
  - `name` (text) - Hunt session name
  - `status` (text) - 'active', 'opening', 'completed'
  - `total_invested` (decimal) - Total amount spent on bonus buys
  - `total_won` (decimal) - Total amount won from opened bonuses
  - `break_even` (decimal) - Calculated break-even amount
  - `profit_loss` (decimal) - Net profit/loss
  - `bonus_count` (integer) - Total number of bonuses
  - `opened_count` (integer) - Number of opened bonuses
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `bonus_hunt_items`
  Individual bonus buys within a hunt
  - `id` (uuid, primary key)
  - `hunt_id` (uuid, foreign key) - References bonus_hunts
  - `slot_id` (uuid, foreign key) - References slots table
  - `slot_name` (text) - Slot machine name
  - `bet_amount` (decimal) - Bet amount for the bonus
  - `buy_cost` (decimal) - Cost of the bonus buy
  - `result_amount` (decimal) - Amount won (null if not opened)
  - `multiplier` (decimal) - Win multiplier (null if not opened)
  - `status` (text) - 'pending', 'opened'
  - `order_index` (integer) - Display order
  - `opened_at` (timestamptz) - When bonus was opened
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Public access for reading and writing (single-user stream setup)

  ## Important Notes
  1. Break-even is calculated as: total_invested - total_won (remaining to break even)
  2. Status flow: active → opening → completed
  3. Real-time updates for overlay display
  4. Tracks order for sequential bonus opening
  5. Links to slots database for slot information
*/

-- Create bonus_hunts table
CREATE TABLE IF NOT EXISTS bonus_hunts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Bonus Hunt',
  status text NOT NULL DEFAULT 'active',
  total_invested decimal(12,2) DEFAULT 0,
  total_won decimal(12,2) DEFAULT 0,
  break_even decimal(12,2) DEFAULT 0,
  profit_loss decimal(12,2) DEFAULT 0,
  bonus_count integer DEFAULT 0,
  opened_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('active', 'opening', 'completed'))
);

-- Create bonus_hunt_items table
CREATE TABLE IF NOT EXISTS bonus_hunt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hunt_id uuid NOT NULL REFERENCES bonus_hunts(id) ON DELETE CASCADE,
  slot_id uuid REFERENCES slots(id) ON DELETE SET NULL,
  slot_name text NOT NULL,
  bet_amount decimal(10,2) NOT NULL,
  buy_cost decimal(12,2) NOT NULL,
  result_amount decimal(12,2),
  multiplier decimal(10,2),
  status text NOT NULL DEFAULT 'pending',
  order_index integer NOT NULL,
  opened_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_item_status CHECK (status IN ('pending', 'opened'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bonus_hunts_status ON bonus_hunts(status);
CREATE INDEX IF NOT EXISTS idx_bonus_hunts_created ON bonus_hunts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bonus_hunt_items_hunt_id ON bonus_hunt_items(hunt_id);
CREATE INDEX IF NOT EXISTS idx_bonus_hunt_items_order ON bonus_hunt_items(hunt_id, order_index);
CREATE INDEX IF NOT EXISTS idx_bonus_hunt_items_status ON bonus_hunt_items(status);

-- Enable Row Level Security
ALTER TABLE bonus_hunts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_hunt_items ENABLE ROW LEVEL SECURITY;

-- Create policies for bonus_hunts table
CREATE POLICY "Anyone can view bonus hunts"
  ON bonus_hunts FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can insert bonus hunts"
  ON bonus_hunts FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can update bonus hunts"
  ON bonus_hunts FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete bonus hunts"
  ON bonus_hunts FOR DELETE
  TO public
  USING (true);

-- Create policies for bonus_hunt_items table
CREATE POLICY "Anyone can view bonus hunt items"
  ON bonus_hunt_items FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can insert bonus hunt items"
  ON bonus_hunt_items FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can update bonus hunt items"
  ON bonus_hunt_items FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete bonus hunt items"
  ON bonus_hunt_items FOR DELETE
  TO public
  USING (true);

-- Function to update hunt totals when items change
CREATE OR REPLACE FUNCTION update_bonus_hunt_totals()
RETURNS TRIGGER AS $$
DECLARE
  hunt_record RECORD;
BEGIN
  -- Get current hunt with all items aggregated
  SELECT
    bh.id,
    COUNT(bhi.id) as total_bonuses,
    COUNT(CASE WHEN bhi.status = 'opened' THEN 1 END) as opened_bonuses,
    COALESCE(SUM(bhi.buy_cost), 0) as total_invested,
    COALESCE(SUM(CASE WHEN bhi.status = 'opened' THEN bhi.result_amount ELSE 0 END), 0) as total_won
  INTO hunt_record
  FROM bonus_hunts bh
  LEFT JOIN bonus_hunt_items bhi ON bhi.hunt_id = bh.id
  WHERE bh.id = COALESCE(NEW.hunt_id, OLD.hunt_id)
  GROUP BY bh.id;

  -- Update the hunt with calculated values
  UPDATE bonus_hunts SET
    bonus_count = hunt_record.total_bonuses,
    opened_count = hunt_record.opened_bonuses,
    total_invested = hunt_record.total_invested,
    total_won = hunt_record.total_won,
    break_even = hunt_record.total_invested - hunt_record.total_won,
    profit_loss = hunt_record.total_won - hunt_record.total_invested,
    updated_at = now()
  WHERE id = hunt_record.id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers to automatically update hunt totals
DROP TRIGGER IF EXISTS trigger_update_hunt_on_insert ON bonus_hunt_items;
CREATE TRIGGER trigger_update_hunt_on_insert
  AFTER INSERT ON bonus_hunt_items
  FOR EACH ROW
  EXECUTE FUNCTION update_bonus_hunt_totals();

DROP TRIGGER IF EXISTS trigger_update_hunt_on_update ON bonus_hunt_items;
CREATE TRIGGER trigger_update_hunt_on_update
  AFTER UPDATE ON bonus_hunt_items
  FOR EACH ROW
  EXECUTE FUNCTION update_bonus_hunt_totals();

DROP TRIGGER IF EXISTS trigger_update_hunt_on_delete ON bonus_hunt_items;
CREATE TRIGGER trigger_update_hunt_on_delete
  AFTER DELETE ON bonus_hunt_items
  FOR EACH ROW
  EXECUTE FUNCTION update_bonus_hunt_totals();

-- Enable realtime for bonus hunt tables
ALTER PUBLICATION supabase_realtime ADD TABLE bonus_hunts;
ALTER PUBLICATION supabase_realtime ADD TABLE bonus_hunt_items;