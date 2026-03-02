import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatMonthYear } from '../lib/time';

interface MonthSelectorProps {
  selectedMonth: string; // YYYY-MM format
  onMonthChange: (month: string) => void;
  isArchived: boolean;
}

export function MonthSelector({ selectedMonth, onMonthChange, isArchived }: MonthSelectorProps) {
  // Parse selected month
  const [year, month] = selectedMonth.split('-').map(Number);
  const currentDate = new Date(year, month - 1, 1);

  // Get current month for comparison
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const handlePrevMonth = () => {
    const prevDate = new Date(year, month - 2, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    onMonthChange(prevMonth);
  };

  const handleNextMonth = () => {
    const nextDate = new Date(year, month, 1);
    const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    onMonthChange(nextMonth);
  };

  const handleToday = () => {
    onMonthChange(currentMonth);
  };

  return (
    <div className="flex items-center justify-between mb-6">
      {/* Month Navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={handlePrevMonth}
          className="p-2 rounded-lg transition-all duration-200 hover:scale-110"
          style={{
            backgroundColor: 'var(--glass-bg-subtle)',
            color: 'var(--text-primary)',
            borderColor: 'var(--glass-border)',
          }}
          title="Previous month"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {formatMonthYear(currentDate)}
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
          onClick={handleNextMonth}
          className="p-2 rounded-lg transition-all duration-200 hover:scale-110"
          style={{
            backgroundColor: 'var(--glass-bg-subtle)',
            color: 'var(--text-primary)',
            borderColor: 'var(--glass-border)',
          }}
          title="Next month"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {selectedMonth !== currentMonth && (
          <button
            onClick={handleToday}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105"
            style={{
              backgroundColor: 'var(--glass-bg-subtle)',
              color: 'var(--text-primary)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: 'var(--glass-border)',
            }}
          >
            Current Month
          </button>
        )}
      </div>
    </div>
  );
}
