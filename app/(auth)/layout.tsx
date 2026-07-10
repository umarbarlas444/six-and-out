import { Suspense } from 'react'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🏏</span>
        <span className="text-lg font-semibold">Six &amp; Out</span>
      </div>
      <Suspense>{children}</Suspense>
    </div>
  )
}
