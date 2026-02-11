import { Link } from 'react-router-dom';
import { Calendar, Target, FileSpreadsheet } from 'lucide-react';
import { Navbar } from '../components/Navbar';

export function HomePage() {
  return (
    <div className="h-full flex flex-col text-foreground" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Navbar breadcrumbItems={[{ label: 'pos' }]} />
      <main className="container mx-auto px-6 py-16 flex-1 overflow-auto">
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold mb-4 text-foreground">
            POS
          </h1>
          <p className="text-xl text-muted-foreground">
            Point of Accountability System
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Eliminate DebtTime. Track every minute. Verify every goal.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <Link
            to="/pos/grid"
            className="group relative overflow-hidden rounded-2xl border p-8 transition-colors duration-200"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
          >
            <Calendar className="w-12 h-12 mb-4" style={{ color: 'var(--pos-info-text)' }} />
            <h2 className="text-2xl font-semibold mb-2 text-foreground">Grid</h2>
            <p className="text-muted-foreground text-sm">
              48-slot visual timeline. See your day at a glance. Track DebtTime and goal-directed productivity.
            </p>
          </Link>

          <Link
            to="/pos/goals"
            className="group relative overflow-hidden rounded-2xl border p-8 transition-colors duration-200"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
          >
            <Target className="w-12 h-12 mb-4" style={{ color: 'var(--pos-warning-text)' }} />
            <h2 className="text-2xl font-semibold mb-2 text-foreground">Goals</h2>
            <p className="text-muted-foreground text-sm">
              Daily goals with verification. Manage DebtGoals. Link objectives to activities.
            </p>
          </Link>

          <Link
            to="/pos/sheets"
            className="group relative overflow-hidden rounded-2xl border p-8 transition-colors duration-200"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
          >
            <FileSpreadsheet className="w-12 h-12 mb-4" style={{ color: 'var(--pos-success-text)' }} />
            <h2 className="text-2xl font-semibold mb-2 text-foreground">Sheets</h2>
            <p className="text-muted-foreground text-sm">
              Competitive programming submissions. Sync LeetCode and Codeforces progress automatically.
            </p>
          </Link>
        </div>

        <div className="mt-16 text-center text-muted-foreground text-sm">
          <p>24-hour accountability. Zero unlogged gaps. Every goal verified.</p>
        </div>
      </main>
    </div>
  );
}
