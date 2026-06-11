import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { env } from '@/lib/env';

export const supabase = createClient<Database>(
  env.supabaseUrl || 'https://placeholder.supabase.co',
  env.supabaseAnonKey || 'placeholder',
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);
