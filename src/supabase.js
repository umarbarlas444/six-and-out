import { createClient } from '@/lib/supabase/client'

// Shared browser client singleton used by the client-side data layer (db.js).
// Backed by @supabase/ssr so the session lives in cookies and is visible to the
// server, middleware, and route handlers.
export const supabase = createClient()
