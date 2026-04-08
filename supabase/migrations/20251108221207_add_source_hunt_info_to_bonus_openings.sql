/*
  # Adicionar informação do Hunt de origem ao Bonus Opening

  1. Alterações
    - Adiciona `source_hunt_id` para referenciar o hunt de origem
    - Adiciona `source_hunt_number` para guardar o número do hunt
    - Adiciona `source_hunt_date` para guardar a data do hunt

  2. Notas
    - Isto permite que o opening mostre o número e data do hunt de onde veio
    - Os campos são nullable para suportar openings antigos ou criados manualmente
*/

-- Add source hunt information columns
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bonus_openings' AND column_name = 'source_hunt_id'
  ) THEN
    ALTER TABLE bonus_openings ADD COLUMN source_hunt_id uuid REFERENCES bonus_hunts(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bonus_openings' AND column_name = 'source_hunt_number'
  ) THEN
    ALTER TABLE bonus_openings ADD COLUMN source_hunt_number integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bonus_openings' AND column_name = 'source_hunt_date'
  ) THEN
    ALTER TABLE bonus_openings ADD COLUMN source_hunt_date timestamptz;
  END IF;
END $$;