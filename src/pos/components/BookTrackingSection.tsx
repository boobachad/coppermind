import { Input } from '@/components/ui/input';
import { BookSelector } from './BookSelector';
import type { Book } from '../lib/types';

interface BookTrackingSectionProps {
  selectedBookId: string | null;
  selectedBook: Book | null;
  pagesRead: string;
  totalPages: string;
  onBookSelected: (bookId: string) => void;
  onPagesReadChange: (value: string) => void;
  onTotalPagesChange: (value: string) => void;
  onTotalPagesBlur: () => void;
}

export function BookTrackingSection({
  selectedBookId,
  selectedBook,
  pagesRead,
  totalPages,
  onBookSelected,
  onPagesReadChange,
  onTotalPagesChange,
  onTotalPagesBlur,
}: BookTrackingSectionProps) {
  return (
    <div
      className="space-y-3 p-4 rounded-lg border"
      style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-primary)' }}
    >
      <BookSelector onBookSelected={onBookSelected} selectedBookId={selectedBookId} />

      {selectedBookId && selectedBook && (
        <div className="space-y-2">
          <label className="block text-sm font-medium">Reading Progress</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Input
                type="number"
                min="0"
                placeholder="Pages read"
                value={pagesRead}
                onChange={(e) => onPagesReadChange(e.target.value)}
              />
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Pages read</span>
            </div>
            <div>
              <Input
                type="number"
                min="0"
                placeholder="Total pages"
                value={totalPages}
                onChange={(e) => onTotalPagesChange(e.target.value)}
                onBlur={onTotalPagesBlur}
              />
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Total pages</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
