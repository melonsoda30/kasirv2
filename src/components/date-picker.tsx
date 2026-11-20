import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { id as indonesia } from 'react-day-picker/locale'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { formatDate } from '@/lib/date'

export interface DatePickerProps {
  id?: string
  type?: 'modal' | 'default'
  value: Date | undefined
  onChange: (value: Date | undefined) => void
  disabled?: boolean
  placeholder?: string
}

/** Single-date picker. Use DatePickerRange for a start and end date. */
export function DatePicker({ id, type = 'default', value, onChange, disabled = false,
  placeholder = 'Pilih tanggal' }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const trigger = (
    <Button id={id} type="button" variant="outline" disabled={disabled} className="w-full justify-start font-normal">
      <CalendarDays aria-hidden="true" />{value ? formatDate(value) : placeholder}
    </Button>
  )
  const picker = (
    <Calendar mode="single" locale={indonesia} captionLayout="dropdown" selected={value}
      defaultMonth={value} className="mx-auto" onSelect={(date) => { onChange(date); setOpen(false) }} />
  )
  if (type === 'modal') return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="max-h-[90dvh] overflow-y-auto">
        <DialogTitle className="sr-only">Pilih tanggal</DialogTitle>
        {picker}
      </DialogContent>
    </Dialog>
  )
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" aria-label="Pilih tanggal" className="w-auto max-w-[calc(100vw-2rem)] overflow-y-auto p-2">
        {picker}
      </PopoverContent>
    </Popover>
  )
}
