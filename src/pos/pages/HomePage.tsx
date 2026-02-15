import { Link, useNavigate } from 'react-router-dom';
import { Calendar, Target, FileSpreadsheet, Plus } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { HeatmapTile } from '../../components/dashboard/HeatmapTile';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../lib/db';

export function HomePage() {
  const navigate = useNavigate();

  const createNote = async () => {
    try {
      const id = uuidv4();
      const db = await getDb();
      const now = Date.now();
      const initialContent = JSON.stringify([]);
      await db.execute('INSERT INTO notes (id, title, content, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)', [
        id, 'Untitled', initialContent, now, now
      ]);
      window.dispatchEvent(new Event('notes-updated'));
      navigate(`/notes/${id}`);
    } catch (err) {
      console.error("Failed to create note", err);
    }
  };

  return (
    <div className="h-full flex flex-col material-base" style={{ color: 'var(--text-primary)' }}>
      {/* Page-level Header/Navbar */}
      <div className="px-6 py-4">
        <Navbar breadcrumbItems={[{ label: 'Dashboard' }]} />
      </div>

      <main className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar">
        <div className="max-w-[1600px] mx-auto">

          {/* Bento Grid Container */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">

            {/* Activity Heatmap (Full Width, Densified) */}
            <HeatmapTile />

            {/* Navigation Tiles (Full Row, Densified) */}
            <div className="col-span-1 md:col-span-12 grid grid-cols-1 sm:grid-cols-4 gap-4">
              <button
                onClick={createNote}
                className="material-panel p-4 group transition-all duration-300 flex flex-col items-center text-center justify-center min-h-[160px] cursor-pointer"
                style={{ backgroundColor: 'var(--glass-bg)' }}
              >
                <div className="mb-3 p-3 rounded-lg transition-colors" style={{ backgroundColor: 'var(--glass-bg-subtle)' }}>
                  <Plus className="w-6 h-6 text-blue-400 group-hover:text-blue-300" />
                </div>
                <h4 className="font-medium text-base mb-1" style={{ color: 'var(--text-primary)' }}>New Note</h4>
                <p className="text-xs max-w-[200px]" style={{ color: 'var(--text-secondary)' }}>Create a new blank note instantly.</p>
              </button>

              <Link
                to="/pos/grid"
                className="material-panel p-4 group hover:bg-white/5 transition-all duration-300 flex flex-col items-center text-center justify-center min-h-[160px]"
              >
                <div className="mb-3 p-3 bg-white/5 rounded-lg group-hover:bg-white/10 transition-colors">
                  <Calendar className="w-6 h-6 text-blue-400 group-hover:text-blue-300" />
                </div>
                <h4 className="font-medium text-base mb-1" style={{ color: 'var(--text-primary)' }}>Grid System</h4>
                <p className="text-xs max-w-[200px]" style={{ color: 'var(--text-secondary)' }}>Track DebtTime & flow across 48 daily slots.</p>
              </Link>

              <Link
                to="/pos/goals"
                className="material-panel p-4 group hover:bg-white/5 transition-all duration-300 flex flex-col items-center text-center justify-center min-h-[160px]"
              >
                <div className="mb-3 p-3 bg-white/5 rounded-lg group-hover:bg-white/10 transition-colors">
                  <Target className="w-6 h-6 text-orange-400 group-hover:text-orange-300" />
                </div>
                <h4 className="font-medium text-base mb-1" style={{ color: 'var(--text-primary)' }}>Goals & Metrics</h4>
                <p className="text-xs max-w-[200px]" style={{ color: 'var(--text-secondary)' }}>Verify daily targets and long-term objectives.</p>
              </Link>

              <Link
                to="/pos/sheets"
                className="material-panel p-4 group hover:bg-white/5 transition-all duration-300 flex flex-col items-center text-center justify-center min-h-[160px]"
              >
                <div className="mb-3 p-3 bg-white/5 rounded-lg group-hover:bg-white/10 transition-colors">
                  <FileSpreadsheet className="w-6 h-6 text-green-400 group-hover:text-green-300" />
                </div>
                <h4 className="font-medium text-base mb-1" style={{ color: 'var(--text-primary)' }}>Data Sheets</h4>
                <p className="text-xs max-w-[200px]" style={{ color: 'var(--text-secondary)' }}>Sync and analyze competitive programming data.</p>
              </Link>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
