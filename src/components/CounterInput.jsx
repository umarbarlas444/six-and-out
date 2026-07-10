import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Minus, Plus } from 'lucide-react'

export default function CounterInput({ id, label, value, onChange, disabled = false }) {
  const n = parseInt(value, 10) || 0
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={disabled || n <= 0}
          onClick={() => onChange(String(n - 1))}
        >
          <Minus className="h-4 w-4" />
          <span className="sr-only">Decrease {label}</span>
        </Button>
        <Input
          id={id}
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          placeholder="0"
          className="text-center"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={disabled}
          onClick={() => onChange(String(n + 1))}
        >
          <Plus className="h-4 w-4" />
          <span className="sr-only">Increase {label}</span>
        </Button>
      </div>
    </div>
  )
}
