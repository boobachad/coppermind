import { MilestoneWidget } from '../pos/components/MilestoneWidget';

export default function MilestonesPage() {
    return (
        <div style={{
            height: '100%', overflow: 'auto', padding: '2rem',
            backgroundColor: 'var(--bg-primary)',
        }}>
            <MilestoneWidget showAll />
        </div>
    );
}
