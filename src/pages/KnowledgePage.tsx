import { useState, useRef } from 'react';
import { BookOpen, Network, Link2 } from 'lucide-react';
import { KnowledgeInbox } from '../components/knowledge/KnowledgeInbox';
import { KnowledgeGraph } from '../components/knowledge/KnowledgeGraph';
import { BacklinksPanel } from '../components/knowledge/BacklinksPanel';
import { DateSummaryPanel } from '../components/knowledge/DateSummaryPanel';
import { KnowledgeItemModal } from '../components/knowledge/KnowledgeItemModal';
import type { KnowledgeItem, YearlyGraphData } from '../pos/lib/types';

type KBTab = 'inbox' | 'graph' | 'backlinks';

export default function KnowledgePage() {
    const [activeTab,    setActiveTab]    = useState<KBTab>('inbox');
    const [selectedItem, setSelectedItem] = useState<KnowledgeItem | null>(null);
    const [isModalOpen,  setIsModalOpen]  = useState(false);
    const [editingItem,  setEditingItem]  = useState<KnowledgeItem | null>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    // graphData ref shared between KnowledgeGraph and DateSummaryPanel —
    // avoids re-fetching when the panel opens
    const graphDataRef = useRef<YearlyGraphData | null>(null);

    const tabs: { key: KBTab; label: string; icon: React.ReactNode }[] = [
        { key: 'inbox',     label: 'Inbox',     icon: <BookOpen size={16} /> },
        { key: 'graph',     label: 'Graph',     icon: <Network size={16} /> },
        { key: 'backlinks', label: 'Backlinks', icon: <Link2 size={16} /> },
    ];

    const handleNodeClick = (item: KnowledgeItem) => {
        setSelectedItem(item);
        setActiveTab('backlinks');
    };

    const handleDateClick = (date: string) => {
        setSelectedDate(date);
    };

    const handleEditItem = (item: KnowledgeItem) => {
        setEditingItem(item);
        setIsModalOpen(true);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--bg-primary)' }}>
            {/* Page Header */}
            <div style={{
                padding: '1.5rem 2rem 0',
                borderBottom: '1px solid var(--border-primary)',
                backgroundColor: 'var(--bg-primary)',
            }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '1rem' }}>
                    Knowledge Base
                </h1>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                    {tabs.map(tab => (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.625rem 1.25rem',
                                borderRadius: '0.5rem 0.5rem 0 0',
                                border: 'none', cursor: 'pointer',
                                fontSize: '0.875rem', fontWeight: '500',
                                transition: 'all 0.15s ease',
                                backgroundColor: activeTab === tab.key ? 'var(--glass-bg)' : 'transparent',
                                color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                                borderBottom: activeTab === tab.key ? '2px solid var(--color-accent-primary)' : '2px solid transparent',
                            }}>
                            {tab.icon}
                            {tab.label}
                            {tab.key === 'backlinks' && selectedItem && (
                                <span style={{
                                    padding: '0.1rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem',
                                    backgroundColor: 'var(--color-accent-primary)', color: 'white',
                                }}>1</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
                {activeTab === 'inbox' && <KnowledgeInbox />}

                {activeTab === 'graph' && (
                    <div style={{ height: '100%', position: 'relative' }}>
                        {/* DateSummaryPanel slides in from the left */}
                        <DateSummaryPanel
                            date={selectedDate}
                            graphData={graphDataRef.current}
                            onClose={() => setSelectedDate(null)}
                        />
                        <KnowledgeGraph
                            selectedItemId={selectedItem?.id ?? null}
                            onNodeClick={handleNodeClick}
                            onDateClick={handleDateClick}
                        />
                    </div>
                )}

                {activeTab === 'backlinks' && (
                    <div style={{ height: '100%', overflow: 'auto', padding: '1.5rem 2rem' }}>
                        {selectedItem ? (
                            <div>
                                <div style={{
                                    padding: '1rem 1.5rem', marginBottom: '1.5rem',
                                    background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                                    borderRadius: '0.75rem', backdropFilter: 'blur(10px)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                }}>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>
                                            Viewing backlinks for
                                        </div>
                                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                                            {selectedItem.itemType}: {selectedItem.content?.slice(0, 80)}{(selectedItem.content?.length ?? 0) > 80 ? '…' : ''}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button onClick={() => handleEditItem(selectedItem)} style={{
                                            padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none',
                                            backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)',
                                            cursor: 'pointer', fontSize: '0.875rem',
                                        }}>Edit Item</button>
                                        <button onClick={() => setSelectedItem(null)} style={{
                                            padding: '0.5rem 1rem', borderRadius: '0.5rem',
                                            border: '1px solid var(--border-primary)',
                                            backgroundColor: 'transparent', color: 'var(--text-secondary)',
                                            cursor: 'pointer', fontSize: '0.875rem',
                                        }}>Clear</button>
                                    </div>
                                </div>
                                <BacklinksPanel
                                    itemId={selectedItem.id}
                                    onItemClick={(id) => setSelectedItem({ ...selectedItem, id })}
                                />
                            </div>
                        ) : (
                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                justifyContent: 'center', height: '60vh',
                                color: 'var(--text-tertiary)', gap: '1rem',
                            }}>
                                <Link2 size={48} style={{ opacity: 0.3 }} />
                                <p style={{ fontSize: '1.125rem' }}>No item selected</p>
                                <p style={{ fontSize: '0.875rem' }}>Click a KB node in the Graph to explore backlinks</p>
                                <button onClick={() => setActiveTab('graph')} style={{
                                    padding: '0.5rem 1.25rem', borderRadius: '0.5rem', border: 'none',
                                    backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)',
                                    cursor: 'pointer',
                                }}>Open Graph</button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <KnowledgeItemModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditingItem(null); }}
                onSuccess={() => { setIsModalOpen(false); setEditingItem(null); }}
                editingItem={editingItem}
            />
        </div>
    );
}