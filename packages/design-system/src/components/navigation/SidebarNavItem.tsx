import type { ReactNode } from 'react';

export interface SidebarNavItemProps {
  icon?: ReactNode;
  label: string;
  active?: boolean;
  badge?: string | number;
}

export function SidebarNavItem({ icon, label, active = false, badge }: SidebarNavItemProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 'var(--radius-md)',
        background: active ? 'var(--indigo-600)' : 'transparent',
        color: active ? '#fff' : 'var(--text-on-sidebar)',
        fontFamily: 'var(--font-ui)',
        fontSize: 14,
        fontWeight: active ? 'var(--fw-semibold)' : 'var(--fw-regular)',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 16, width: 18, display: 'inline-flex', justifyContent: 'center' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge ? (
        <span
          style={{
            background: 'var(--red-500)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 'var(--fw-semibold)',
            borderRadius: 'var(--radius-pill)',
            padding: '1px 6px',
          }}
        >
          {badge}
        </span>
      ) : null}
    </div>
  );
}
