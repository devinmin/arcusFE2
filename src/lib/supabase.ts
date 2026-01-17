import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Campaign {
  id: string;
  name: string;
  access_code: string;
  description: string;
  active_campaigns_count: number;
  content_generated_count: number;
  roi_percentage: number;
  created_at: string;
  updated_at: string;
}
