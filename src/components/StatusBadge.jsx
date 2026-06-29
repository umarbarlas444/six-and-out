export default function StatusBadge({ label, color }) {
  if (!label) return null

  const hex = (color ?? '#6B7280').replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors"
      style={{
        backgroundColor: color ?? '#6B7280',
        color: lum > 0.55 ? '#111827' : '#ffffff',
      }}
    >
      {label}
    </span>
  )
}
