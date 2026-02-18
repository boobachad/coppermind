/**
 * Time picker utilities for shadcn/ui
 * Based on OpenStatus time-picker
 */

export function getArrowByType(type: "hours" | "minutes" | "seconds", step: number) {
  switch (type) {
    case "hours":
      return { up: 1, down: -1 };
    case "minutes":
    case "seconds":
      return { up: step, down: -step };
  }
}

export function setDateByType(date: Date, value: number, type: "hours" | "minutes" | "seconds") {
  const newDate = new Date(date);
  switch (type) {
    case "hours":
      newDate.setHours(value);
      break;
    case "minutes":
      newDate.setMinutes(value);
      break;
    case "seconds":
      newDate.setSeconds(value);
      break;
  }
  return newDate;
}

export function getDateByType(date: Date, type: "hours" | "minutes" | "seconds") {
  switch (type) {
    case "hours":
      return date.getHours();
    case "minutes":
      return date.getMinutes();
    case "seconds":
      return date.getSeconds();
  }
}

export function getValidNumber(value: string, max: number, min = 0) {
  const numericValue = parseInt(value, 10);
  if (isNaN(numericValue)) return 0;
  if (numericValue > max) return max;
  if (numericValue < min) return min;
  return numericValue;
}

export function getValidHour(value: string) {
  return getValidNumber(value, 23);
}

export function getValidMinuteOrSecond(value: string) {
  return getValidNumber(value, 59);
}

export function getValidArrowNumber(value: number, max: number, min = 0) {
  if (value > max) return min;
  if (value < min) return max;
  return value;
}

export function getValidArrowHour(value: number) {
  return getValidArrowNumber(value, 23);
}

export function getValidArrowMinuteOrSecond(value: number) {
  return getValidArrowNumber(value, 59);
}
