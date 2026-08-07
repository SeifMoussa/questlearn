const { Button, Input } = window.QuestLearnDesignSystem_196be4;

function AuthCard({ children, width = 440 }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, fontFamily: 'var(--font-ui)' }}>
      <div style={{ width, background: '#fff', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)', padding: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 28 }}>
          <svg width="24" height="24" viewBox="0 0 34 34"><circle cx="17" cy="17" r="15" fill="none" stroke="var(--brand-primary)" strokeWidth="4" /><line x1="27" y1="27" x2="33" y2="33" stroke="var(--brand-primary)" strokeWidth="4" strokeLinecap="round" /></svg>
          <span style={{ fontSize: 18, fontWeight: 'var(--fw-bold)' }}>QuestLearn</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <div style={{ marginBottom: 16 }}><label style={{ display: 'block', fontSize: 13, fontWeight: 'var(--fw-medium)', color: 'var(--text-primary)', marginBottom: 6 }}>{label}</label>{children}</div>;
}

function ErrorBanner({ children }) {
  return <div style={{ background: 'var(--status-at-risk-bg)', color: 'var(--status-at-risk-fg)', fontSize: 13, padding: '10px 12px', borderRadius: 'var(--radius-md)', marginBottom: 16 }}>{children}</div>;
}

function FieldError({ children }) {
  return <div style={{ color: 'var(--red-600)', fontSize: 12, marginTop: 4 }}>{children}</div>;
}

function RegisterScreen({ showValidation }) {
  return (
    <AuthCard>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 'var(--fw-semibold)', margin: '0 0 4px', textAlign: 'center' }}>Create your account</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', margin: '0 0 24px' }}>Start turning lessons into quests.</p>
      <Field label="Full Name"><Input placeholder="Jamie Rivera" /></Field>
      <Field label="Email">
        <Input placeholder="you@school.edu" value={showValidation ? 'not-an-email' : undefined} onChange={() => {}} />
        {showValidation && <FieldError>Enter a valid email address.</FieldError>}
      </Field>
      <Field label="Password">
        <Input placeholder="At least 8 characters" />
        {showValidation && <FieldError>Password must be at least 8 characters.</FieldError>}
      </Field>
      <Field label="I am a…">
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 'var(--radius-md)', border: '2px solid var(--brand-primary)', color: 'var(--brand-primary)', fontWeight: 'var(--fw-semibold)', fontSize: 13 }}>Teacher</div>
          <div style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: 13 }}>Learner</div>
        </div>
      </Field>
      <Button variant="primary" size="lg">Create Account</Button>
      <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)', marginTop: 18 }}>Already have an account? <a href="#">Sign in</a></div>
    </AuthCard>
  );
}

function LoginScreen({ showError }) {
  return (
    <AuthCard>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 'var(--fw-semibold)', margin: '0 0 4px', textAlign: 'center' }}>Welcome back</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', margin: '0 0 24px' }}>Sign in to continue your quest.</p>
      {showError && <ErrorBanner>Invalid email or password.</ErrorBanner>}
      <Field label="Email"><Input placeholder="you@school.edu" /></Field>
      <Field label="Password"><Input placeholder="Your password" /></Field>
      <div style={{ textAlign: 'right', fontSize: 13, marginBottom: 18, marginTop: -8 }}><a href="#">Forgot password?</a></div>
      <Button variant="primary" size="lg">Sign In</Button>
      <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)', marginTop: 18 }}>New to QuestLearn? <a href="#">Create an account</a></div>
    </AuthCard>
  );
}

function VerifyEmailScreen() {
  return (
    <AuthCard>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--indigo-50)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 18px' }}>✉</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 'var(--fw-semibold)', margin: '0 0 8px' }}>Check your email</h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 'var(--lh-relaxed)', margin: '0 0 24px' }}>
          We sent a verification link to <strong style={{ color: 'var(--text-primary)' }}>jamie.rivera@school.edu</strong>. Click the link to activate your account.
        </p>
        <Button variant="secondary" size="md">Resend Email</Button>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 18 }}>Wrong email? <a href="#">Go back</a></div>
      </div>
    </AuthCard>
  );
}

function ForgotPasswordScreen() {
  return (
    <AuthCard>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 'var(--fw-semibold)', margin: '0 0 4px', textAlign: 'center' }}>Reset your password</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', margin: '0 0 24px' }}>Enter your email and we'll send you a reset link.</p>
      <Field label="Email"><Input placeholder="you@school.edu" /></Field>
      <Button variant="primary" size="lg">Send Reset Link</Button>
      <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)', marginTop: 18 }}><a href="#">‹ Back to sign in</a></div>
    </AuthCard>
  );
}

function ResetPasswordScreen() {
  return (
    <AuthCard>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 'var(--fw-semibold)', margin: '0 0 4px', textAlign: 'center' }}>Choose a new password</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', margin: '0 0 24px' }}>Make it at least 8 characters.</p>
      <Field label="New Password"><Input placeholder="At least 8 characters" /></Field>
      <Field label="Confirm New Password"><Input placeholder="Re-enter your password" /></Field>
      <Button variant="primary" size="lg">Update Password</Button>
    </AuthCard>
  );
}

function DashboardPlaceholderScreen() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-page)', fontFamily: 'var(--font-ui)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px', background: '#fff', borderBottom: '1px solid var(--border-default)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'var(--fw-bold)', fontSize: 18 }}>
          <svg width="22" height="22" viewBox="0 0 34 34"><circle cx="17" cy="17" r="15" fill="none" stroke="var(--brand-primary)" strokeWidth="4" /><line x1="27" y1="27" x2="33" y2="33" stroke="var(--brand-primary)" strokeWidth="4" strokeLinecap="round" /></svg>
          QuestLearn
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
          <span>jamie.rivera@school.edu</span>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--indigo-100)', color: 'var(--indigo-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 'var(--fw-semibold)' }}>JR</div>
          <a href="#">Log out</a>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 24px', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 'var(--radius-lg)', background: 'var(--indigo-50)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, marginBottom: 20 }}>◆</div>
        <h1 style={{ fontSize: 22, fontWeight: 'var(--fw-semibold)', margin: '0 0 8px' }}>You're signed in — nothing built here yet</h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 380, lineHeight: 'var(--lh-relaxed)' }}>
          This is a placeholder landing spot after login. Classes, quests, and analytics arrive in later modules.
        </p>
      </div>
    </div>
  );
}

window.AuthScreens = { RegisterScreen, LoginScreen, VerifyEmailScreen, ForgotPasswordScreen, ResetPasswordScreen, DashboardPlaceholderScreen };
