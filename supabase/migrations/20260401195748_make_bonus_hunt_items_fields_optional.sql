/*
  # Tornar campos de bonus_hunt_items opcionais

  1. Alterações
    - Tornar `slot_name` opcional (permite NULL, valor padrão '')
    - Tornar `bet_amount` opcional (permite NULL, valor padrão 0)
    - Tornar `is_super_bonus` opcional (já permite NULL)

  2. Notas
    - Permite criar itens rapidamente sem preencher todos os campos
    - Campos podem ser preenchidos posteriormente
*/

-- Alterar slot_name para permitir NULL e ter valor padrão
ALTER TABLE bonus_hunt_items 
  ALTER COLUMN slot_name DROP NOT NULL,
  ALTER COLUMN slot_name SET DEFAULT '';

-- Alterar bet_amount para permitir NULL e ter valor padrão 0
ALTER TABLE bonus_hunt_items 
  ALTER COLUMN bet_amount DROP NOT NULL,
  ALTER COLUMN bet_amount SET DEFAULT 0;
