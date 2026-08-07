export type ProgressBarTone = 'indigo' | 'teal' | 'green' | 'amber' | 'red';

export interface ProgressBarProps {
  value: number;
  tone?: ProgressBarTone;
  label?: string;
  showValue?: boolean;
  size?: 'sm' | 'md';
}

const tones: Record<ProgressBarTone, string> = {
  indigo: 'var(--brand-primary)',
  teal: 'var(--accent-mastery)',
  green: 'var(--accent-success)',
  amber: 'var(--accent-warning)',
  red: 'var(--accent-danger)',
};

export function ProgressBar({ value = 0, tone = 'indigo', label, showValue = true, size = 'md' }: ProgressBarProps) {
  const height = size === 'sm' ? 6 : 8;
  return (
    <div style={{ fontFamily: 'var(--font-ui)', width: '100%' }}>
      {(label || showValue) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
          <span>{label}</span>
          {showValue && <span style={{ fontWeight: 'var(--fw-semibold)', color: 'var(--text-primary)' }}>{value}%</span>}
        </div>
      )}
      <div style={{ height, background: 'var(--gray-100)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${Math.min(100, Math.max(0, value))}%`,
            background: tones[tone] || tones.indigo,
            borderRadius: 'var(--radius-pill)',
          }}
        />
      </div>
    </div>
  );
}
