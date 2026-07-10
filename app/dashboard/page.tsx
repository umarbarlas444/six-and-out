'use client'

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

// The booking app is a browser-only SPA (FullCalendar, localStorage, direct
// supabase-js from the client). Render it client-side only. This route is
// protected by middleware — unauthenticated users are redirected to /login.
const App = dynamic(() => import('@/App'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">Loading…</span>
    </div>
  ),
})

export default function DashboardPage() {
  return <App />
}
