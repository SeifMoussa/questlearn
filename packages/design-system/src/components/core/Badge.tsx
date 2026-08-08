import type { ReactNode } from 'react';

export type BadgeTone = 'onTrack' | 'needsSupport' | 'atRisk' | 'neutral' | 'brand';

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
}

const tones: Record<BadgeTone, { bg: string; fg: string }> = {
  onTrack: { bg: 'var(--status-on-track-bg)', fg: 'var(--status-on-track-fg)' },
  needsSupport: { bg: 'var(--status-needs-support-bg)', fg: 'var(--status-needs-support-fg)' },
  atRisk: { bg: 'var(--status-at-risk-bg)', fg: 'var(--status-at-risk-fg)' },
  neutral: { bg: 'var(--gray-100)', fg: 'var(--gray-700)' },
  brand: { bg: 'var(--indigo-50)', fg: 'var(--brand-primary)' },
};

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  const t = tones[tone] || tones.neutral;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: t.bg,
        color: t.fg,
        padding: '4px 10px',
        borderRadius: 'var(--radius-pill)',
        fontFamily: 'var(--font-ui)',
        fontSize: 12,
        fontWeight: 'var(--fw-medium)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
