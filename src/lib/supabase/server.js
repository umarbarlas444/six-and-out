import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Server (Server Component / Route Handler / Server Action) Supabase client.
// Reads and writes the session cookies via Next's cookie store.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component — cookies are read-only here.
            // Session refresh is handled by the middleware, so this is safe to ignore.
          }
        },
      },
    },
  )
}
