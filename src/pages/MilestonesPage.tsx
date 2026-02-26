import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MilestoneWidget } from '../pos/components/MilestoneWidget';

export default function MilestonesPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const shouldCreate = searchParams.get('create') === 'true';

    useEffect(() => {
        if (shouldCreate) {
            // Clear the query parameter after reading it
            setSearchParams({});
        }
    }, [shouldCreate, setSearchParams]);

    return (
        <div style={{
            height: '100%', overflow: 'auto', padding: '2rem',
            backgroundColor: 'var(--bg-primary)',
        }}>
            <MilestoneWidget showAll openCreateModal={shouldCreate} />
        </div>
    );
}
