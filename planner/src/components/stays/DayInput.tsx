import type { MouseEvent } from 'react'

// A native date input laid unseen over the day it changes, so a phone opens its own picker. A desktop browser only
// opens the picker from its own small icon, so a click anywhere on the day opens it.

export function DayInput({ label, value, min, onPick }: {
  label: string
  value: string
  min?: string
  /** a day picked, as yyyy-mm-dd. Without it the day cannot be changed */
  onPick?: (day: string) => void
}) {
  const open = (e: MouseEvent<HTMLInputElement>) => {
    try {
      e.currentTarget.showPicker?.()
    } catch {
      // a browser that refuses showPicker still opens its picker the native way
    }
  }
  return (
    <input
      type="date" aria-label={label} value={value} min={min} readOnly={!onPick} onClick={onPick ? open : undefined}
      // a year typed digit by digit passes through years like 0002, which are let go
      onChange={(e) => e.target.value >= '2000' && onPick?.(e.target.value)}
    />
  )
}
