import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Calendar, Save, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Navbar } from '../../pos/components/Navbar';
import { JournalEntry } from '../types';
import ImageUploader from '../components/ImageUploader';
import MarkdownEditor from '../components/MarkdownEditor';
import { formatDateDDMMYYYY } from '../../pos/lib/time';
import { getDb } from '../../lib/db';

export default function EntryPage() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [reflectionText, setReflectionText] = useState('');
  const [expectedImage, setExpectedImage] = useState('');
  const [actualImage, setActualImage] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (date) loadEntry();
  }, [date]);

  const loadEntry = async () => {
    try {
      const db = await getDb();
      const rows = await db.select<any[]>(
        'SELECT id, date, expected_schedule_image, actual_schedule_image, reflection_text, created_at, updated_at FROM journal_entries WHERE date = $1',
        [date]
      );
      
      if (rows.length > 0) {
        const row = rows[0];
        
        // Calculate dayX
        const allDates = await db.select<any[]>('SELECT date FROM journal_entries ORDER BY date ASC');
        const dayX = allDates.findIndex(d => d.date === date) + 1;
        
        const entryData: JournalEntry = {
          id: row.id,
          date: row.date,
          expectedScheduleImage: row.expected_schedule_image || '',
          actualScheduleImage: row.actual_schedule_image || '',
          reflectionText: row.reflection_text || '',
          dayX,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
        
        setEntry(entryData);
        setReflectionText(entryData.reflectionText);
        setExpectedImage(entryData.expectedScheduleImage);
        setActualImage(entryData.actualScheduleImage);
      } else {
        toast.error('Entry not found');
        navigate('/journal');
      }
    } catch (error) {
      toast.error('Failed to load entry', { description: String(error) });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!date || !hasChanges) return;

    setSaving(true);
    try {
      const db = await getDb();
      const now = Date.now();
      
      await db.execute(
        'UPDATE journal_entries SET expected_schedule_image = $1, actual_schedule_image = $2, reflection_text = $3, updated_at = $4 WHERE date = $5',
        [expectedImage, actualImage, reflectionText, now, date]
      );
      
      setHasChanges(false);
      toast.success('Changes saved');
      await loadEntry();
    } catch (error) {
      toast.error('Failed to save', { description: String(error) });
    } finally {
      setSaving(false);
    }
  };

  const handleReflectionChange = (content: string) => {
    setReflectionText(content);
    setHasChanges(true);
  };

  const handleExpectedImageChange = (base64: string) => {
    setExpectedImage(base64);
    setHasChanges(true);
  };

  const handleActualImageChange = (base64: string) => {
    setActualImage(base64);
    setHasChanges(true);
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Navbar breadcrumbItems={[{ label: 'journal' }, { label: date || '' }]} />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2" style={{ borderColor: 'var(--text-primary)' }}></div>
        </div>
      </div>
    );
  }

  if (!entry) return null;

  const isPast = new Date(date!) < new Date(new Date().toISOString().split('T')[0]);

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Navbar breadcrumbItems={[{ label: 'journal', href: '/journal' }, { label: `Day ${entry.dayX}` }]} />
      
      <main className="container mx-auto px-6 py-8 flex-1 overflow-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Day {entry.dayX}</h1>
            <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
              <Calendar className="h-5 w-5" />
              <p className="text-lg">{formatDateDDMMYYYY(new Date(entry.date))}</p>
            </div>
          </div>
          <Button onClick={() => navigate('/journal')} variant="outline" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>

        {!isPast && (
          <div className="flex justify-end mb-6">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2" style={{ borderColor: 'currentColor' }}></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <Card style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <CardContent className="p-4">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Calendar className="h-5 w-5" />
                Expected Schedule
              </h3>
              <ImageUploader
                initialImageUrl={expectedImage}
                onImageChange={handleExpectedImageChange}
                isLocked={isPast}
              />
            </CardContent>
          </Card>

          <Card style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <CardContent className="p-4">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Calendar className="h-5 w-5" />
                Actual Schedule
              </h3>
              <ImageUploader
                initialImageUrl={actualImage}
                onImageChange={handleActualImageChange}
                isLocked={isPast}
              />
            </CardContent>
          </Card>
        </div>

        <Card style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
          <CardContent className="p-4">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Calendar className="h-5 w-5" />
              Daily Reflection
            </h3>
            <MarkdownEditor
              initialContent={reflectionText}
              onContentChange={handleReflectionChange}
              readOnly={isPast}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
