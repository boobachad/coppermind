import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Navbar } from '../../pos/components/Navbar';
import { JournalEntry } from '../types';
import { getLocalDateString, formatDateDDMMYYYY } from '../../pos/lib/time';
import { getDb } from '../../lib/db';

function genId(): string {
  return Math.random().toString(36).substring(2, 14);
}

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadEntries();
  }, []);

  const loadEntries = async () => {
    try {
      const db = await getDb();
      const rows = await db.select<any[]>(
        'SELECT id, date, expected_schedule_image, actual_schedule_image, reflection_text, created_at, updated_at FROM journal_entries ORDER BY date DESC'
      );
      
      const entriesWithDayX = rows.map((row, index) => ({
        id: row.id,
        date: row.date,
        expectedScheduleImage: row.expected_schedule_image || '',
        actualScheduleImage: row.actual_schedule_image || '',
        reflectionText: row.reflection_text || '',
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
    const exists = entries.some(e => e.date === today);
    
    if (exists) {
      navigate(`/journal/${today}`);
      return;
    }

    const isPast = new Date(today) < new Date(new Date().toISOString().split('T')[0]);
    if (isPast) {
      toast.error('Cannot create entries for past dates');
      return;
    }

    try {
      const db = await getDb();
      const id = genId();
      const now = Date.now();
      
      await db.execute(
        'INSERT INTO journal_entries (id, date, expected_schedule_image, actual_schedule_image, reflection_text, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [id, today, '', '', '', now, now]
      );
      
      navigate(`/journal/${today}`);
    } catch (error) {
      toast.error('Failed to create entry', { description: String(error) });
    }
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Navbar breadcrumbItems={[{ label: 'journal' }]} />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2" style={{ borderColor: 'var(--text-primary)' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Navbar breadcrumbItems={[{ label: 'journal' }]} />
      
      <main className="container mx-auto px-6 py-8 flex-1 overflow-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <Calendar className="h-6 w-6" style={{ color: 'var(--text-primary)' }} />
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Journal</h1>
          </div>
          <Button onClick={handleCreateEntry} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Entry
          </Button>
        </div>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>No entries yet</p>
            <Button onClick={handleCreateEntry} className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create First Entry
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {entries.map(entry => (
              <Card
                key={entry.id}
                onClick={() => navigate(`/journal/${entry.date}`)}
                className="cursor-pointer hover:shadow-md transition-shadow"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Day {entry.dayX}</h3>
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {formatDateDDMMYYYY(new Date(entry.date))}
                    </span>
                  </div>
                  <p className="text-sm line-clamp-3" style={{ color: 'var(--text-secondary)' }}>
                    {entry.reflectionText || 'No reflection yet'}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
