import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatMonthYear, parseGoalDate, formatGoalDate } from '../lib/time';

type DateMode = 'day' | 'month' | 'year';

interface MonthSelectorProps {
  value: string;
  onChange: (value: string) => void;
  mode?: DateMode;
  isArchived?: boolean;
}

export function MonthSelector({ value, onChange, mode = 'month', isArchived = false }: MonthSelectorProps) {
  const parseValue = () => {
    if (mode === 'day') {
      // value is YYYY-MM-DD, parse without timezone conversion
      const [year, month, day] = value.split('-').map(Number);
      return { year, month, day };
    } else if (mode === 'month') {
      // value is YYYY-MM
      const [year, month] = value.split('-').map(Number);
      return { year, month, day: 1 };
    } else {
      // value is YYYY
      return { year: Number(value), month: 1, day: 1 };
    }
  };

  const { year, month } = parseValue();

  const now = new Date();
  const getCurrentValue = () => {
    if (mode === 'day') {
      const offset = now.getTimezoneOffset() * 60000;
      const localDate = new Date(now.getTime() - offset);
      return localDate.toISOString().split('T')[0];
    } else if (mode === 'month') {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    } else {
      return `${now.getFullYear()}`;
    }
  };

  const currentValue = getCurrentValue();

  const handlePrev = () => {
    if (mode === 'day') {
      // Use parseGoalDate to avoid timezone issues
      const currentDate = parseGoalDate(value);
      currentDate.setDate(currentDate.getDate() - 1);
      onChange(formatGoalDate(currentDate));
    } else if (mode === 'month') {
      const newDate = new Date(year, month - 2, 1);
      onChange(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`);
    } else {
      onChange(`${year - 1}`);
    }
  };

  const handleNext = () => {
    if (mode === 'day') {
      // Use parseGoalDate to avoid timezone issues
      const currentDate = parseGoalDate(value);
      currentDate.setDate(currentDate.getDate() + 1);
      onChange(formatGoalDate(currentDate));
    } else if (mode === 'month') {
      const newDate = new Date(year, month, 1);
      onChange(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`);
    } else {
      onChange(`${year + 1}`);
    }
  };

  const handleCurrent = () => {
    onChange(currentValue);
  };

  const getDisplayText = () => {
    if (mode === 'day') {
      // Parse without timezone conversion
      const date = parseGoalDate(value);
      return date.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' });
    } else if (mode === 'month') {
      const date = new Date(year, month - 1, 1);
      return formatMonthYear(date);
    } else {
      return `${year}`;
    }
  };

  const getCurrentButtonText = () => {
    if (mode === 'day') return 'Today';
    if (mode === 'month') return 'Current Month';
    return 'Current Year';
  };

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <button
          onClick={handlePrev}
          className="p-2 rounded-lg transition-all duration-200 hover:scale-110"
          style={{
            backgroundColor: 'var(--glass-bg-subtle)',
            color: 'var(--text-primary)',
            borderColor: 'var(--glass-border)',
          }}
          title={`Previous ${mode}`}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {getDisplayText()}
          </h2>
          {isArchived && (
            <span
              className="px-3 py-1 rounded-md text-xs font-semibold"
              style={{
                backgroundColor: 'var(--glass-bg-subtle)',
                color: 'var(--text-secondary)',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: 'var(--glass-border)',
              }}
            >
              Archived
            </span>
          )}
        </div>

        <button
          onClick={handleNext}
          className="p-2 rounded-lg transition-all duration-200 hover:scale-110"
          style={{
            backgroundColor: 'var(--glass-bg-subtle)',
            color: 'var(--text-primary)',
            borderColor: 'var(--glass-border)',
          }}
          title={`Next ${mode}`}
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {value !== currentValue && (
          <button
            onClick={handleCurrent}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105"
            style={{
              backgroundColor: 'var(--glass-bg-subtle)',
              color: 'var(--text-primary)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: 'var(--glass-border)',
            }}
          >
            {getCurrentButtonText()}
          </button>
        )}
      </div>
    </div>
  );
}
