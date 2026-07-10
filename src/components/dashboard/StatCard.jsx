import { Card, CardContent } from '@/components/ui/card'

export default function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground/70" />
        </div>
        <p className="truncate text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}
