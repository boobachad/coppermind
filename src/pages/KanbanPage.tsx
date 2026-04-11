import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, X, GripVertical, Flag, Clock, Tag, RefreshCw, Target } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { UnifiedGoal } from '@/pos/lib/types';
import { getLocalDateString } from '@/pos/lib/time';
import clsx from 'clsx';

type KanbanStatus = 'idea' | 'backlog' | 'in_progress' | 'done';

interface KanbanCard {
  id: string;
  text: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high';
  urgent: boolean;
  labels: string[] | null;
  status: KanbanStatus;
  date: string | null;
  completed: boolean;
  isDebt: boolean;
}

const COLUMNS: { id: KanbanStatus; label: string; color: string }[] = [
  { id: 'idea',        label: 'Ideas',       color: 'var(--color-warning)' },
  { id: 'backlog',     label: 'Backlog',      color: 'var(--text-tertiary)' },
  { id: 'in_progress', label: 'In Progress',  color: 'var(--color-accent-primary)' },
  { id: 'done',        label: 'Done',         color: 'var(--color-success)' },
];

const PRIORITY_COLORS: Record<string, string> = {
  high:   'var(--color-error)',
  medium: 'var(--color-warning)',
  low:    'var(--text-tertiary)',
};

// Internal status labels — never shown in user-facing filter or card badges
const STATUS_LABELS = new Set(['idea', 'in_progress', 'done']);

function goalToCard(goal: UnifiedGoal): KanbanCard {
  let status: KanbanStatus = 'backlog';
  if (goal.completed) {
    status = 'done';
  } else if (goal.labels?.includes('in_progress') || (goal.linkedActivityIds && goal.linkedActivityIds.length > 0)) {
    status = 'in_progress';
  } else if (goal.labels?.includes('idea')) {
    status = 'idea';
  }
  return {
    id: goal.id,
    text: goal.text,
    description: goal.description,
    priority: goal.priority,
    urgent: goal.urgent,
    labels: goal.labels,
    status,
    date: goal.date,
    completed: goal.completed,
    isDebt: goal.isDebt,
  };
}

// ─── Add Card Form ───────────────────────────────────────────────

interface AddCardFormProps {
  onAdd: (text: string, priority: 'low' | 'medium' | 'high') => void;
  onCancel: () => void;
}

function AddCardForm({ onAdd, onCancel }: AddCardFormProps) {
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd(text.trim(), priority);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-3 rounded-xl border space-y-2"
      style={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border-highlight)' }}
    >
      <Input
        ref={inputRef}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Card title…"
        className="text-sm h-8"
        style={{ backgroundColor: 'var(--glass-bg-subtle)', borderColor: 'var(--glass-border)' }}
        onKeyDown={e => e.key === 'Escape' && onCancel()}
      />
      <div className="flex items-center gap-2">
        <Select value={priority} onValueChange={v => setPriority(v as 'low' | 'medium' | 'high')}>
          <SelectTrigger
            className="h-7 text-xs flex-1"
            style={{ backgroundColor: 'var(--glass-bg-subtle)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>
        {/* Raw buttons — consistent with the rest of the page */}
        <button
          type="submit"
          className="h-7 px-3 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
          style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
        >
          Add
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors"
          style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--glass-bg-subtle)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </form>
  );
}

// ─── Card Item ───────────────────────────────────────────────────

interface KanbanCardItemProps {
  card: KanbanCard;
  onDelete: (id: string) => void;
  onClick: (card: KanbanCard) => void;
  isDragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}

function KanbanCardItem({ card, onDelete, onClick, isDragging, onDragStart, onDragEnd }: KanbanCardItemProps) {
  const userLabels = (card.labels ?? []).filter(l => !STATUS_LABELS.has(l));

  return (
    <div
      draggable
      onDragStart={e => {
        // Store card ID in the native drag data store — synchronous, no React state race
        e.dataTransfer.setData('text/plain', card.id);
        e.dataTransfer.effectAllowed = 'move';
        e.stopPropagation();
        onDragStart(card.id);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onClick(card)}
      className={clsx(
        'group relative p-3 rounded-xl border cursor-pointer transition-all duration-150 select-none',
        isDragging ? 'opacity-40 scale-95' : 'hover:scale-[1.01]',
      )}
      style={{
        backgroundColor: 'var(--glass-bg-subtle)',
        borderColor: 'var(--glass-border)',
        boxShadow: isDragging ? 'none' : '0 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      {/* Priority stripe */}
      <div
        className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full"
        style={{ backgroundColor: PRIORITY_COLORS[card.priority] }}
      />

      <div className="pl-2">
        <p
          className={clsx('text-sm font-medium leading-snug', card.completed && 'line-through opacity-50')}
          style={{ color: 'var(--text-primary)' }}
        >
          {card.text}
        </p>

        {card.description && (
          <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-tertiary)' }}>
            {card.description}
          </p>
        )}

        {(card.urgent || card.isDebt || userLabels.length > 0 || card.date) && (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {card.urgent && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4"
                style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
              >
                urgent
              </Badge>
            )}
            {card.isDebt && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4"
                style={{ borderColor: 'var(--pos-debt-border)', color: 'var(--pos-debt-text)' }}
              >
                debt
              </Badge>
            )}
            {userLabels.slice(0, 2).map(l => (
              <Badge
                key={l}
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4"
                style={{ color: 'var(--text-tertiary)', borderColor: 'var(--glass-border)' }}
              >
                {l}
              </Badge>
            ))}
            {card.date && (
              <span
                className="text-[10px] ml-auto flex items-center gap-0.5"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <Clock className="w-2.5 h-2.5" />
                {card.date}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={e => { e.stopPropagation(); onDelete(card.id); }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity"
        style={{ color: 'var(--text-tertiary)' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-error)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
      >
        <X className="w-3 h-3" />
      </button>

      {/* Drag handle hint */}
      <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-25 pointer-events-none">
        <GripVertical className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
      </div>
    </div>
  );
}

// ─── Card Detail Modal ───────────────────────────────────────────

interface CardDetailModalProps {
  card: KanbanCard | null;
  onClose: () => void;
  onStatusChange: (id: string, status: KanbanStatus) => void;
}

function CardDetailModal({ card, onClose, onStatusChange }: CardDetailModalProps) {
  if (!card) return null;
  const userLabels = (card.labels ?? []).filter(l => !STATUS_LABELS.has(l));

  return (
    <Dialog open={!!card} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base" style={{ color: 'var(--text-primary)' }}>
            {card.text}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {card.description && (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{card.description}</p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Priority:</span>
            <Badge
              variant="outline"
              className="text-xs"
              style={{ color: PRIORITY_COLORS[card.priority], borderColor: PRIORITY_COLORS[card.priority] }}
            >
              <Flag className="w-3 h-3 mr-1" />{card.priority}
            </Badge>
            {card.urgent && (
              <Badge variant="outline" className="text-xs" style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
                urgent
              </Badge>
            )}
          </div>

          {userLabels.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Tag className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
              {userLabels.map(l => (
                <Badge key={l} variant="outline" className="text-xs">{l}</Badge>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Move to</p>
            <div className="flex gap-2 flex-wrap">
              {COLUMNS.map(col => {
                const isActive = card.status === col.id;
                return (
                  <button
                    key={col.id}
                    onClick={() => { onStatusChange(card.id, col.id); onClose(); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
                    style={{
                      backgroundColor: isActive ? col.color : 'var(--glass-bg-subtle)',
                      borderColor: isActive ? col.color : 'var(--glass-border)',
                      color: isActive ? 'white' : 'var(--text-secondary)',
                      opacity: isActive ? 1 : 0.85,
                    }}
                  >
                    {col.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ────────────────────────────────────────────────────────

export function KanbanPage() {
  const navigate = useNavigate();
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addingTo, setAddingTo] = useState<KanbanStatus | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<KanbanStatus | null>(null);
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
  const [labelFilter, setLabelFilter] = useState<string>('all');

  const loadGoals = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const today = getLocalDateString();
      const goals = await invoke<UnifiedGoal[]>('get_unified_goals', { filters: { todayLocal: today } });
      setCards(goals.filter(g => !g.recurringPattern).map(goalToCard));
    } catch (err) {
      toast.error('Failed to load goals', { description: String(err) });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadGoals(); }, []);

  const handleAddCard = async (columnId: KanbanStatus, text: string, priority: 'low' | 'medium' | 'high') => {
    const statusLabel = columnId !== 'backlog' ? columnId : null;
    try {
      await invoke('create_unified_goal', {
        req: {
          text,
          description: null,
          date: getLocalDateString(),
          priority,
          urgent: false,
          labels: statusLabel ? [statusLabel] : [],
          dueDate: null,
          recurringPattern: null,
          metrics: null,
        },
      });
      setAddingTo(null);
      await loadGoals(true);
    } catch (err) {
      toast.error('Failed to add card', { description: String(err) });
    }
  };

  const handleMove = async (id: string, newStatus: KanbanStatus) => {
    const card = cards.find(c => c.id === id);
    if (!card || card.status === newStatus) return;

    // Optimistic update — reflect status and completed together
    setCards(prev => prev.map(c =>
      c.id === id ? { ...c, status: newStatus, completed: newStatus === 'done' } : c
    ));

    try {
      const baseLabels = (card.labels ?? []).filter(l => !STATUS_LABELS.has(l));
      const newLabels = [...baseLabels];
      if (newStatus === 'in_progress') newLabels.push('in_progress');
      if (newStatus === 'idea') newLabels.push('idea');
      if (newStatus === 'done') newLabels.push('done');

      // update_unified_goal handles both completed=true and completed=false
      await invoke('update_unified_goal', {
        id,
        req: {
          completed: newStatus === 'done',
          labels: newLabels,
        },
      });
    } catch (err) {
      toast.error('Failed to move card', { description: String(err) });
      await loadGoals(true); // revert to server truth
    }
  };

  const handleDelete = async (id: string) => {
    setCards(prev => prev.filter(c => c.id !== id));
    try {
      await invoke('delete_unified_goal', { id });
    } catch (err) {
      toast.error('Failed to delete card', { description: String(err) });
      await loadGoals(true);
    }
  };

  // ─── Drag & Drop ─────────────────────────────────────────────
  // Guard dragLeave against firing when moving over child elements
  const handleDragOver = (e: React.DragEvent, colId: KanbanStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Only update state when column changes — avoids re-render storm
    if (dragOverCol !== colId) setDragOverCol(colId);
  };

  const handleDragLeave = (e: React.DragEvent, colId: KanbanStatus) => {
    // Only clear if we're actually leaving the column (not entering a child)
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
    if (dragOverCol === colId) setDragOverCol(null);
  };

  const handleDrop = (e: React.DragEvent, colId: KanbanStatus) => {
    e.preventDefault();
    // Read card ID from the native drag data store — always current, no stale closure
    const id = e.dataTransfer.getData('text/plain');
    if (id) {
      const card = cards.find(c => c.id === id);
      if (card && card.status !== colId) handleMove(id, colId);
    }
    setDraggingId(null);
    setDragOverCol(null);
  };

  // ─── Derived ─────────────────────────────────────────────────
  const allLabels = Array.from(
    new Set(cards.flatMap(c => (c.labels ?? []).filter(l => !STATUS_LABELS.has(l))))
  );
  const filteredCards = labelFilter === 'all' ? cards : cards.filter(c => c.labels?.includes(labelFilter));
  const columnCards = (colId: KanbanStatus) => filteredCards.filter(c => c.status === colId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-tertiary)' }}>
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>

      {/* Header */}
      <div
        className="flex items-center justify-between px-8 py-5 border-b flex-shrink-0"
        style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--bg-primary)' }}
      >
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Kanban</h1>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/goals')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all duration-200 hover:scale-105"
            style={{ backgroundColor: 'var(--glass-bg-subtle)', borderColor: 'var(--glass-border)', color: 'var(--text-secondary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            <Target className="w-4 h-4" />
            Goals
          </button>
          {allLabels.length > 0 && (
            <Select value={labelFilter} onValueChange={setLabelFilter}>
              <SelectTrigger
                className="h-8 text-xs w-36"
                style={{ backgroundColor: 'var(--glass-bg-subtle)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}
              >
                <SelectValue placeholder="Filter by label" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All labels</SelectItem>
                {allLabels.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {/* Refresh — raw button, consistent with MonthSelector pattern */}
          <button
            onClick={() => loadGoals(true)}
            disabled={refreshing}
            className="p-2 rounded-lg transition-all duration-200 hover:scale-110 disabled:opacity-50"
            style={{ backgroundColor: 'var(--glass-bg-subtle)', color: 'var(--text-primary)' }}
            title="Refresh"
          >
            <RefreshCw className={clsx('w-4 h-4', refreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex items-stretch gap-4 p-6 h-full">
          {COLUMNS.map(col => {
            const colCards = columnCards(col.id);
            const isOver = dragOverCol === col.id;

            return (
              <div
                key={col.id}
                className="flex flex-col w-72 flex-shrink-0 rounded-2xl border transition-all duration-150 min-h-0"
                style={{
                  backgroundColor: isOver ? 'var(--glass-bg)' : 'var(--glass-bg-subtle)',
                  borderColor: isOver ? col.color : 'var(--glass-border)',
                  boxShadow: isOver ? `0 0 0 1px ${col.color}` : 'none',
                }}
                onDragOver={e => handleDragOver(e, col.id)}
                onDragLeave={e => handleDragLeave(e, col.id)}
                onDrop={e => handleDrop(e, col.id)}
              >
                {/* Column header */}
                <div
                  className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
                  style={{ borderColor: 'var(--glass-border)' }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {col.label}
                    </span>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: 'var(--glass-border)', color: 'var(--text-tertiary)' }}
                    >
                      {colCards.length}
                    </span>
                  </div>
                  <button
                    onClick={() => setAddingTo(col.id)}
                    className="p-1 rounded-lg transition-colors"
                    style={{ color: 'var(--text-tertiary)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Cards list — scrolls independently */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0" style={{ scrollbarWidth: 'thin' }}>
                  {colCards.map(card => (
                    <KanbanCardItem
                      key={card.id}
                      card={card}
                      onDelete={handleDelete}
                      onClick={setSelectedCard}
                      isDragging={draggingId === card.id}
                      onDragStart={setDraggingId}
                      onDragEnd={() => { setDraggingId(null); setDragOverCol(null); }}
                    />
                  ))}

                  {colCards.length === 0 && addingTo !== col.id && (
                    <div
                      className="flex items-center justify-center h-16 rounded-xl border-2 border-dashed"
                      style={{ borderColor: 'var(--glass-border)', color: 'var(--text-tertiary)' }}
                    >
                      <span className="text-xs">Drop here</span>
                    </div>
                  )}

                  {addingTo === col.id && (
                    <AddCardForm
                      onAdd={(text, priority) => handleAddCard(col.id, text, priority)}
                      onCancel={() => setAddingTo(null)}
                    />
                  )}
                </div>

                {/* Add card footer */}
                {addingTo !== col.id && (
                  <button
                    onClick={() => setAddingTo(col.id)}
                    className="flex items-center gap-2 px-4 py-3 text-xs border-t transition-colors flex-shrink-0 rounded-b-2xl"
                    style={{ color: 'var(--text-tertiary)', borderColor: 'var(--glass-border)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add card
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <CardDetailModal
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
        onStatusChange={handleMove}
      />
    </div>
  );
}
