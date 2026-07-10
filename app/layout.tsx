import './globals.css'
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Six & Out — Cricket Ground Booking',
  description: 'Cricket ground booking manager',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/favicon.svg' },
}

export const viewport: Viewport = {
  themeColor: '#0f172a',
}

// Applies the persisted theme before first paint to avoid a light→dark flash.
// Mirrors the logic in ThemeContext so the resolved theme is identical.
const themeScript = `
(function () {
  try {
    var t = localStorage.getItem('theme') || 'system';
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var isDark = t === 'dark' || (t === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', isDark);
  } catch (e) {}
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
