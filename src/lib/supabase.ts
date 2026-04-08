import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type OverlayType = 'bar' | 'background' | 'bonus_hunt' | 'bonus_opening' | 'chill' | 'chatbox' | 'fever_champions' | 'fever_bracket' | 'fever_groups' | 'main_stream' | 'chat' | 'alerts';

export interface Overlay {
  id: string;
  type: OverlayType;
  name: string;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_id: string;
}
