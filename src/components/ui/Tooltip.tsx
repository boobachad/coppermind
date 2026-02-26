import { ReactNode } from 'react';

interface TooltipProps {
  children: ReactNode;
  x: number;
  y: number;
  visible: boolean;
}

export function Tooltip({ children, x, y, visible }: TooltipProps) {
  if (!visible) return null;

  return (
    <div 
      className="absolute px-4 py-2 rounded-lg shadow-2xl whitespace-nowrap z-20 pointer-events-none backdrop-blur-sm"
      style={{ 
        backgroundColor: 'var(--surface-secondary)',
        border: '2px solid var(--border-primary)',
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translateX(-50%)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
      }}
    >
      {children}
    </div>
  );
}
