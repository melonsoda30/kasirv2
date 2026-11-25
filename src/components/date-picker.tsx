import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { id as indonesia } from 'react-day-picker/locale'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
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
    <Button id={id} type="button" variant="outline" size="lg" disabled={disabled} className="w-full min-w-0 justify-start text-left text-base font-normal whitespace-normal">
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
      <DialogContent wide aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Pilih tanggal</DialogTitle>
        </DialogHeader>
        <DialogBody>{picker}</DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Batal</Button>
          </DialogClose>
        </DialogFooter>
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
