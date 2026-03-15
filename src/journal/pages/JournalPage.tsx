import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Navbar } from '../../pos/components/Navbar';
import { Loader } from '@/components/Loader';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { getLocalDateString, formatDateDDMMYYYY } from '../../pos/lib/time';
import { JournalEntry } from '../types';
import { getDb } from '../../lib/db';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import { softDelete } from '@/lib/softDelete';
import { MonthSelector } from '../../pos/components/MonthSelector';

function genId(): string {
  return Math.random().toString(36).substring(2, 14);
}

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { confirm } = useConfirmDialog();
  
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  useEffect(() => {
    loadEntries();
  }, [selectedMonth]);

  const loadEntries = async () => {
    try {
      const db = await getDb();
      const [year, month] = selectedMonth.split('-');
      const startDate = `${year}-${month}-01`;
      const endDate = `${year}-${month}-31`;
      
      const rows = await db.select<any[]>(
        'SELECT id, date, expected_schedule_image, actual_schedule_image, reflection_text, expected_schedule_data, actual_schedule_data, created_at, updated_at FROM journal_entries WHERE date >= $1 AND date <= $2 ORDER BY date DESC',
        [startDate, endDate]
      );
      
      const entriesWithDayX = rows.map((row, index) => ({
        id: row.id,
        date: row.date,
        expectedScheduleImage: row.expected_schedule_image || '',
        actualScheduleImage: row.actual_schedule_image || '',
        reflectionText: row.reflection_text || '',
        expectedScheduleData: row.expected_schedule_data ? JSON.parse(row.expected_schedule_data) : null,
        actualScheduleData: row.actual_schedule_data ? JSON.parse(row.actual_schedule_data) : null,
        dayX: rows.length - index,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
      
      setEntries(entriesWithDayX);
    } catch (error) {
      toast.error('Failed to load entries', { description: String(error) });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEntry = async () => {
    const today = getLocalDateString();
    
    // Check if today's entry already exists in loaded entries
    const exists = entries.some(e => e.date === today);
    
    if (exists) {
      navigate(`/journal/${today}`);
      return;
    }

    try {
      const db = await getDb();
      const id = genId();
      const now = Date.now();
      
      // Double-check database for today's entry
      const existing = await db.select<any[]>(
        'SELECT id FROM journal_entries WHERE date = $1',
        [today]
      );
      
      if (existing.length > 0) {
        // Entry exists, just navigate to it and reload
        navigate(`/journal/${today}`);
        await loadEntries();
        return;
      }
      
      await db.execute(
        'INSERT INTO journal_entries (id, date, expected_schedule_image, actual_schedule_image, reflection_text, expected_schedule_data, actual_schedule_data, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [id, today, '', '', '', null, null, now, now]
      );
      
      navigate(`/journal/${today}`);
    } catch (error) {
      const errorMsg = String(error);
      if (errorMsg.includes('UNIQUE constraint failed')) {
        // Entry was created by another process, navigate to it
        navigate(`/journal/${today}`);
        await loadEntries();
      } else {
        toast.error('Failed to create entry', { description: errorMsg });
      }
    }
  };

  const handleDelete = async (e: React.MouseEvent, entryId: string) => {
    e.stopPropagation();
    
    const confirmed = await confirm({
      title: 'Delete Journal Entry',
      description: 'Delete this journal entry? This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await softDelete('journal_entries', entryId);
      toast.success('Entry deleted');
      await loadEntries();
    } catch (error) {
      toast.error('Failed to delete entry', { description: String(error) });
    }
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Navbar breadcrumbItems={[{ label: 'journal' }]} />
        <div className="flex-1 flex items-center justify-center">
          <Loader />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Navbar breadcrumbItems={[{ label: 'journal' }]} />
      
      <main className="container mx-auto px-6 py-8 flex-1 overflow-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <Calendar className="h-6 w-6" style={{ color: 'var(--text-primary)' }} />
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Journal</h1>
          </div>
          <Button 
            onClick={handleCreateEntry} 
            className="flex items-center gap-2 hover:opacity-90"
            style={{
              backgroundColor: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)'
            }}
          >
            <Plus className="h-4 w-4" />
            New Entry
          </Button>
        </div>

        <MonthSelector 
          value={selectedMonth} 
          onChange={setSelectedMonth} 
          mode="month"
        />

        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>No entries for this month</p>
            <Button 
              onClick={handleCreateEntry} 
              className="flex items-center gap-2 hover:opacity-90"
              style={{
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)'
              }}
            >
              <Plus className="h-5 w-5" />
              Create Entry for Today
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {entries.map(entry => {
              const hasExpected = !!(entry.expectedScheduleImage || entry.expectedScheduleData);
              const hasActual = !!(entry.actualScheduleImage || entry.actualScheduleData);
              const hasReflection = !!(entry.reflectionText && entry.reflectionText.trim().length > 0);
              
              return (
              <Card
                key={entry.id}
                onClick={() => navigate(`/journal/${entry.date}`)}
                className="cursor-pointer hover:shadow-md transition-shadow relative group"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Day {entry.dayX}</h3>
                      <div className="flex gap-1.5 mb-2">
                        {hasExpected && <span className="journal-badge journal-badge-expected">expected</span>}
                        {hasActual && <span className="journal-badge journal-badge-actual">actual</span>}
                        {hasReflection && <span className="journal-badge journal-badge-reflection">reflection</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {formatDateDDMMYYYY(new Date(entry.date))}
                      </span>
                      <button
                        onClick={(e) => handleDelete(e, entry.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-opacity-10"
                        style={{ color: 'var(--color-error)' }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  
                  {entry.reflectionText && (
                    <div className="text-sm line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                      <MarkdownRenderer content={entry.reflectionText} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
