import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MilestoneWidget } from '../pos/components/MilestoneWidget';
import { MonthSelector } from '../pos/components/MonthSelector';

export default function MilestonesPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const shouldCreate = searchParams.get('create') === 'true';

    // Initialize with current month (YYYY-MM format)
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);

    // Check if selected month is in the past
    const isArchived = selectedMonth < currentMonth;

    useEffect(() => {
        if (shouldCreate) {
            setSearchParams({});
        }
    }, [shouldCreate, setSearchParams]);

    return (
        <div style={{
            height: '100%', overflow: 'auto', padding: '2rem',
            backgroundColor: 'var(--bg-base)',
        }}>
            <MonthSelector
                selectedMonth={selectedMonth}
                onMonthChange={setSelectedMonth}
                isArchived={isArchived}
            />
            <MilestoneWidget
                month={selectedMonth}
                showAll={false}
                openCreateModal={shouldCreate}
                isArchived={isArchived}
            />
        </div>
    );
}
