/**
 * Time picker input component for shadcn/ui
 * Based on OpenStatus time-picker
 */

import React from "react";
import { Input } from "@/components/ui/input";
import {
  getArrowByType,
  getDateByType,
  setDateByType,
  getValidArrowHour,
  getValidArrowMinuteOrSecond,
  getValidHour,
  getValidMinuteOrSecond,
} from "./time-picker-utils";

interface TimePickerInputProps {
  date: Date | undefined;
  setDate: (date: Date | undefined) => void;
  type: "hours" | "minutes" | "seconds";
  step?: number;
}

export function TimePickerInput({ date, setDate, type, step = 1 }: TimePickerInputProps) {
  const [value, setValue] = React.useState<string>(() => {
    if (!date) return "00";
    const val = getDateByType(date, type);
    return val.toString().padStart(2, "0");
  });

  React.useEffect(() => {
    if (!date) {
      setValue("00");
      return;
    }
    const val = getDateByType(date, type);
    setValue(val.toString().padStart(2, "0"));
  }, [date, type]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!date) return;

    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const arrow = getArrowByType(type, step);
      const current = getDateByType(date, type);
      const newValue = e.key === "ArrowUp" ? current + arrow.up : current + arrow.down;
      
      const validValue = type === "hours" 
        ? getValidArrowHour(newValue)
        : getValidArrowMinuteOrSecond(newValue);
      
      const newDate = setDateByType(date, validValue, type);
      setDate(newDate);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setValue(inputValue);

    if (inputValue.length === 2) {
      const numericValue = type === "hours"
        ? getValidHour(inputValue)
        : getValidMinuteOrSecond(inputValue);
      
      const newDate = setDateByType(date || new Date(), numericValue, type);
      setDate(newDate);
    }
  };

  const handleBlur = () => {
    if (!date) return;
    
    const numericValue = type === "hours"
      ? getValidHour(value)
      : getValidMinuteOrSecond(value);
    
    setValue(numericValue.toString().padStart(2, "0"));
    const newDate = setDateByType(date, numericValue, type);
    setDate(newDate);
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      className="w-14 text-center"
      maxLength={2}
    />
  );
}
