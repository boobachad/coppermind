import * as React from "react"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "p-3 group/calendar", // Removed bg-background
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-4 md:flex-row",
          defaultClassNames.months
        ),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 border-(--glass-border) hover:bg-(--glass-bg-subtle) text-(--text-primary)",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 border-(--glass-border) hover:bg-(--glass-bg-subtle) text-(--text-primary)",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-8 w-full items-center justify-center px-8", // Adjusted height/padding
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "flex h-8 w-full items-center justify-center gap-1.5 text-sm font-medium",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "has-focus:border-(--glass-border-highlight) border-(--glass-border) shadow-xs has-focus:ring-(--glass-border-highlight)/50 has-focus:ring-[3px] relative rounded-md border text-(--text-primary)",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "bg-transparent absolute inset-0 opacity-0 cursor-pointer", // Removed bg-popover
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "select-none font-medium text-(--text-primary)",
          captionLayout === "label"
            ? "text-sm"
            : "[&>svg]:text-(--text-secondary) flex h-8 items-center gap-1 rounded-md pl-2 pr-1 text-sm [&>svg]:size-3.5",
          defaultClassNames.caption_label
        ),
        table: "w-full border-collapse",
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "text-(--text-secondary) flex-1 select-none rounded-md text-[0.8rem] font-normal",
          defaultClassNames.weekday
        ),
        week: cn("mt-2 flex w-full", defaultClassNames.week),
        week_number_header: cn(
          "w-8 select-none",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "text-(--text-secondary) select-none text-[0.8rem]",
          defaultClassNames.week_number
        ),
        day: cn(
          "group/day relative aspect-square h-full w-full select-none p-0 text-center [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md text-(--text-primary)",
          defaultClassNames.day
        ),
        range_start: cn(
          "bg-(--glass-bg-subtle) rounded-l-md",
          defaultClassNames.range_start
        ),
        range_middle: cn("rounded-none bg-(--glass-bg-subtle)", defaultClassNames.range_middle),
        range_end: cn("bg-(--glass-bg-subtle) rounded-r-md", defaultClassNames.range_end),
        today: cn(
          "bg-(--glass-bg-subtle) text-(--text-primary) rounded-md border border-(--glass-border)",
          defaultClassNames.today
        ),
        outside: cn(
          "text-(--text-tertiary) aria-selected:text-(--text-secondary)",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-(--text-tertiary) opacity-50",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4 text-(--text-primary)", className)} {...props} />
            )
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-4 text-(--text-primary)", className)}
                {...props}
              />
            )
          }

          return (
            <ChevronDownIcon className={cn("size-4 text-(--text-primary)", className)} {...props} />
          )
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-[--cell-size] items-center justify-center text-center text-(--text-secondary)">
                {children}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "data-[selected-single=true]:bg-(--text-primary) data-[selected-single=true]:text-(--bg-base) data-[range-middle=true]:bg-(--glass-bg-subtle) data-[range-middle=true]:text-(--text-primary) data-[range-start=true]:bg-(--text-primary) data-[range-start=true]:text-(--bg-base) data-[range-end=true]:bg-(--text-primary) data-[range-end=true]:text-(--bg-base) group-data-[focused=true]/day:border-(--glass-border) group-data-[focused=true]/day:ring-(--glass-border-highlight)/50 flex aspect-square h-auto w-full min-w-8 flex-col gap-1 font-normal leading-none data-[range-end=true]:rounded-md data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-md group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] [&>span]:text-xs [&>span]:opacity-70 hover:bg-(--glass-bg-subtle) hover:text-(--text-primary)",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  ) // Removed duplicate closing brace from original diff if any, matching context precisely.
}

export { Calendar, CalendarDayButton }
