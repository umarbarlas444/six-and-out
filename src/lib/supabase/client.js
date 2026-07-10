import { createBrowserClient } from '@supabase/ssr'

// Browser (client component) Supabase client. Stores the session in cookies so
// the server, middleware, and route handlers can read it.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}
