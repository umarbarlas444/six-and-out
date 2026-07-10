import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Six & Out — Cricket Ground Booking',
    short_name: 'Six & Out',
    description: 'Cricket ground booking manager',
    theme_color: '#0f172a',
    background_color: '#0f172a',
    display: 'standalone',
    start_url: '/',
    icons: [
      {
        src: '/icons/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  }
}
