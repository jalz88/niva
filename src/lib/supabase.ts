import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly at boot rather than producing confusing runtime errors on
  // the first Supabase call. See docs/10-api-data-access-spec.md §1 — the
  // anon key is safe client-side because RLS is the real access boundary.
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your Supabase project values.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
