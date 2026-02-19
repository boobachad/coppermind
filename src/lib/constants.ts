import { Smile, Check, Stamp } from 'lucide-react';

export const STICKER_TYPES = [
  { id: 'postal', label: 'Postal', icon: Stamp, color: 'var(--color-error)' },
  { id: 'check', label: 'Approved', icon: Check, color: 'var(--color-success)' },
  { id: 'smile', label: 'Smile', icon: Smile, color: 'var(--color-warning)' },
];
