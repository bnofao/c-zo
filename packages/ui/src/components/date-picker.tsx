'use client'

import { Button } from '@workspace/ui/components/button'
import { Calendar } from '@workspace/ui/components/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@workspace/ui/components/popover'
import { cn } from '@workspace/ui/lib/utils'
import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import * as React from 'react'

function DatePicker({
  value,
  onValueChange,
  placeholder = 'Pick a date',
  className,
}: {
  value?: Date
  onValueChange?: (date: Date | undefined) => void
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [internal, setInternal] = React.useState<Date | undefined>(value)
  const date = value ?? internal

  function handleSelect(next: Date | undefined) {
    setInternal(next)
    onValueChange?.(next)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(
          <Button
            variant="outline"
            data-empty={!date}
            className={cn(
              'w-[240px] justify-start text-left font-normal data-[empty=true]:text-muted-foreground',
              className,
            )}
          />
        )}
      >
        <CalendarIcon />
        {date ? format(date, 'PPP') : <span>{placeholder}</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={handleSelect} autoFocus />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
