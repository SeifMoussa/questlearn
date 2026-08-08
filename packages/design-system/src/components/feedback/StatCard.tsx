import type { ReactNode } from 'react';

export type StatCardTone = 'indigo' | 'teal' | 'amber' | 'red';

export interface StatCardProps {
  icon?: ReactNode;
  label: string;
  value: string | number;
  delta?: string;
  deltaDirection?: 'up' | 'down';
  tone?: StatCardTone;
}

const tones: Record<StatCardTone, { bg: string; fg: string }> = {
  indigo: { bg: 'var(--indigo-50)', fg: 'var(--brand-primary)' },
  teal: { bg: 'var(--teal-50)', fg: 'var(--teal-600)' },
  amber: { bg: 'var(--amber-50)', fg: 'var(--amber-600)' },
  red: { bg: 'var(--red-50)', fg: 'var(--red-600)' },
};

export function StatCard({ icon, label, value, delta, deltaDirection = 'up', tone = 'indigo' }: StatCardProps) {
  const t = tones[tone] || tones.indigo;
  const deltaColor = deltaDirection === 'up' ? 'var(--green-600)' : 'var(--red-600)';
  const arrow = deltaDirection === 'up' ? '↑' : '↓';
  return (
    <div
      style={{
        background: 'var(--surface-card)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-card)',
        padding: 18,
        fontFamily: 'var(--font-ui)',
        minWidth: 180,
      }}
    >
      {icon ? (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-md)',
            background: t.bg,
            color: t.fg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            marginBottom: 10,
          }}
        >
          {icon}
        </div>
      ) : null}
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 'var(--fs-stat)', fontWeight: 'var(--fw-bold)', color: 'var(--text-primary)' }}>{value}</div>
      {delta ? (
        <div style={{ fontSize: 12, fontWeight: 'var(--fw-medium)', color: deltaColor, marginTop: 4 }}>
          {arrow} {delta}
        </div>
      ) : null}
    </div>
  );
}
