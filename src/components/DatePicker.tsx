import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "../lib/utils"
import { Button } from "./ui/button"
import { Calendar } from "./ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover"

interface DatePickerProps {
  date?: Date
  setDate: (date?: Date) => void
  placeholder?: string
}

export function DatePicker({ date, setDate, placeholder = "Pick a date" }: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal border-gray-300 dark:border-dark-border dark:bg-dark-bg dark:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-dark-surface",
            !date && "text-muted-foreground dark:text-gray-500"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "PPP") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          captionLayout="dropdown"
          fromYear={1900}
          toYear={new Date().getFullYear() + 10}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
