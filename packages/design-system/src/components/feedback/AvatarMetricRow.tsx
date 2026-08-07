export type AvatarMetricRowTone = 'onTrack' | 'needsSupport' | 'atRisk' | 'brand';

export interface AvatarMetricRowProps {
  name: string;
  meta?: string;
  metricLabel?: string;
  metricValue?: string;
  tone?: AvatarMetricRowTone;
}

const badgeTones: Record<AvatarMetricRowTone, { bg: string; fg: string }> = {
  onTrack: { bg: 'var(--status-on-track-bg)', fg: 'var(--status-on-track-fg)' },
  needsSupport: { bg: 'var(--status-needs-support-bg)', fg: 'var(--status-needs-support-fg)' },
  atRisk: { bg: 'var(--status-at-risk-bg)', fg: 'var(--status-at-risk-fg)' },
  brand: { bg: 'var(--indigo-100)', fg: 'var(--indigo-700)' },
};

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function AvatarMetricRow({ name, meta, metricLabel, metricValue, tone = 'brand' }: AvatarMetricRowProps) {
  const t = badgeTones[tone] || badgeTones.brand;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', fontFamily: 'var(--font-ui)' }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: t.bg,
          color: t.fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 'var(--fw-semibold)',
          flexShrink: 0,
        }}
      >
        {initials(name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 'var(--fw-medium)', color: 'var(--text-primary)' }}>{name}</div>
        {meta ? <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{meta}</div> : null}
      </div>
      {metricValue ? (
        <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 'var(--fw-semibold)', color: t.fg, whiteSpace: 'nowrap' }}>
          {metricValue}
          {metricLabel ? <div style={{ fontSize: 11, fontWeight: 'var(--fw-regular)', color: 'var(--text-secondary)' }}>{metricLabel}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
