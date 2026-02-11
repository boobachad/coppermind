import { Link } from 'react-router-dom';
import { Calendar, Target, FileSpreadsheet } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { ActivityHeatmap } from '../components/ActivityHeatmap';

export function HomePage() {
  return (
    <div className="h-full flex flex-col text-foreground" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Navbar breadcrumbItems={[{ label: 'pos' }]} />
      <main className="container mx-auto px-4 py-8 flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-2 text-foreground">POS</h1>
            <p className="text-sm text-muted-foreground">Point of Accountability System</p>
          </div>

          {/* Heatmap */}
          <ActivityHeatmap />

          {/* Navigation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link
              to="/pos/grid"
              className="group p-6 rounded-lg border transition-colors"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
            >
              <Calendar className="w-8 h-8 mb-3" style={{ color: 'var(--pos-info-text)' }} />
              <h2 className="text-lg font-semibold mb-1 text-foreground">Grid</h2>
              <p className="text-sm text-muted-foreground">
                48-slot timeline. Track DebtTime and productivity.
              </p>
            </Link>

            <Link
              to="/pos/goals"
              className="group p-6 rounded-lg border transition-colors"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
            >
              <Target className="w-8 h-8 mb-3" style={{ color: 'var(--pos-warning-text)' }} />
              <h2 className="text-lg font-semibold mb-1 text-foreground">Goals</h2>
              <p className="text-sm text-muted-foreground">
                Daily goals with verification. Manage DebtGoals.
              </p>
            </Link>

            <Link
              to="/pos/sheets"
              className="group p-6 rounded-lg border transition-colors"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
            >
              <FileSpreadsheet className="w-8 h-8 mb-3" style={{ color: 'var(--pos-success-text)' }} />
              <h2 className="text-lg font-semibold mb-1 text-foreground">Sheets</h2>
              <p className="text-sm text-muted-foreground">
                Competitive programming submissions sync.
              </p>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
