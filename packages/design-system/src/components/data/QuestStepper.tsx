export type QuestStepStatus = 'completed' | 'active' | 'locked';

export interface QuestStep {
  label: string;
  status: QuestStepStatus;
}

export interface QuestStepperProps {
  steps: QuestStep[];
}

function dot(status: QuestStepStatus) {
  if (status === 'completed') return { bg: 'var(--green-500)', fg: '#fff', border: undefined };
  if (status === 'active') return { bg: '#fff', fg: 'var(--brand-primary)', border: '2px solid var(--brand-primary)' };
  return { bg: 'var(--gray-100)', fg: 'var(--gray-400)', border: undefined };
}

export function QuestStepper({ steps = [] }: QuestStepperProps) {
  return (
    <div style={{ fontFamily: 'var(--font-ui)' }}>
      {steps.map((step, i) => {
        const d = dot(step.status);
        const last = i === steps.length - 1;
        return (
          <div key={i} style={{ display: 'flex', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: d.bg,
                  color: d.fg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  flexShrink: 0,
                  border: d.border,
                }}
              >
                {step.status === 'completed' ? '✓' : i + 1}
              </div>
              {!last ? (
                <div
                  style={{
                    width: 2,
                    flex: 1,
                    minHeight: 24,
                    background: step.status === 'locked' ? 'var(--gray-200)' : 'var(--green-300)',
                    margin: '2px 0',
                  }}
                />
              ) : null}
            </div>
            <div style={{ paddingBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 'var(--fw-medium)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.03em' }}>
                Step {i + 1}
              </div>
              <div style={{ fontSize: 15, fontWeight: 'var(--fw-semibold)', color: step.status === 'locked' ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                {step.label}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, textTransform: 'capitalize' }}>
                {step.status === 'active' ? 'In Progress' : step.status}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
