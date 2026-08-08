import type { ReactNode } from 'react';

export interface TagProps {
  children: ReactNode;
  onRemove?: () => void;
}

export function Tag({ children, onRemove }: TagProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: 'var(--gray-100)',
        color: 'var(--gray-700)',
        padding: '4px 8px 4px 10px',
        borderRadius: 'var(--radius-sm)',
        fontFamily: 'var(--font-ui)',
        fontSize: 13,
        fontWeight: 'var(--fw-medium)',
      }}
    >
      {children}
      {onRemove ? (
        <span onClick={onRemove} style={{ cursor: 'pointer', color: 'var(--gray-500)', fontSize: 14, lineHeight: 1 }}>
          ×
        </span>
      ) : null}
    </span>
  );
}
