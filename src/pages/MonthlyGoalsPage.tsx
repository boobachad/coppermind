import { MonthlyGoalWidget } from '../pos/components/MonthlyGoalWidget';

export default function MonthlyGoalsPage() {
    return (
        <div style={{
            height: '100%', overflow: 'auto', padding: '2rem',
            backgroundColor: 'var(--bg-primary)',
        }}>
            <MonthlyGoalWidget showAll />
        </div>
    );
}
