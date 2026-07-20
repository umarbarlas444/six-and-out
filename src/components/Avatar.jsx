import { useState, useEffect } from 'react'

// Shared circular avatar: shows `src` when there's a photo, otherwise the
// person's initials on the app's usual gradient chip.
//
// Extracted from the copies in Leaderboard.jsx and TeamSeriesModal.jsx when
// customer photos made this a third call site. Those two still use their local
// versions — they render initials only and had no reason to change.

function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

export default function Avatar({ name, src, className = '', ringClass = '', alt }) {
  // A stored avatar_url can outlive its object (bucket cleaned up by hand, bad
  // URL); fall back to initials rather than showing a broken image.
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [src])

  const ring = ringClass ? `ring-2 ${ringClass} ring-offset-2 ring-offset-card` : ''
  const base = `shrink-0 overflow-hidden rounded-full ${ring} ${className}`

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={alt ?? (name ? `${name} photo` : 'Customer photo')}
        loading="lazy"
        // The production host serves the app with COEP: require-corp. Supabase
        // Storage sends `access-control-allow-origin: *` but no
        // Cross-Origin-Resource-Policy header, so a default (no-cors) image load
        // is blocked with ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedTo-
        // SameOriginByCoep even though the request returns 200. Fetching in CORS
        // mode satisfies COEP via the wildcard ACAO. Do not remove.
        crossOrigin="anonymous"
        onError={() => setFailed(true)}
        className={`${base} bg-muted object-cover`}
      />
    )
  }

  return (
    <div
      className={`${base} flex items-center justify-center bg-gradient-to-br from-muted to-accent font-semibold text-foreground/80`}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  )
}
