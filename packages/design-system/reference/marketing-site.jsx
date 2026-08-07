const { Button, Badge } = window.QuestLearnDesignSystem_196be4;

function NavBar() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 48px', borderBottom: '1px solid var(--border-default)', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg width="26" height="26" viewBox="0 0 34 34"><circle cx="17" cy="17" r="15" fill="none" stroke="var(--brand-primary)" strokeWidth="4" /><line x1="27" y1="27" x2="33" y2="33" stroke="var(--brand-primary)" strokeWidth="4" strokeLinecap="round" /></svg>
        <span style={{ fontSize: 20, fontWeight: 'var(--fw-bold)' }}>QuestLearn</span>
      </div>
      <div style={{ display: 'flex', gap: 32, fontSize: 14, fontWeight: 'var(--fw-medium)', color: 'var(--text-primary)' }}>
        <span>Product</span><span>For Teachers</span><span>For Tutors</span><span>Pricing</span><span>Resources</span>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Button variant="secondary" size="sm">Sign in</Button>
        <Button variant="primary" size="sm">Start Free →</Button>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <div style={{ display: 'flex', gap: 48, padding: '56px 48px', alignItems: 'center', background: 'linear-gradient(180deg,#F8F7FE,#fff)' }}>
      <div style={{ flex: 1 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-semibold)', fontSize: 44, lineHeight: 'var(--lh-tight)', color: 'var(--text-primary)', margin: 0 }}>
          Turn every lesson into a <span style={{ color: 'var(--brand-primary)' }}>learning quest</span>.
        </h1>
        <p style={{ fontSize: 17, color: 'var(--text-secondary)', marginTop: 20, maxWidth: 440, lineHeight: 'var(--lh-relaxed)' }}>
          Create interactive lessons, assign quests, reward meaningful progress, and track concept mastery.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
          <Button variant="primary" size="lg">Start as a Teacher</Button>
          <Button variant="secondary" size="lg">Join a Class</Button>
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 32, fontSize: 13, color: 'var(--text-secondary)' }}>
          <span>✓ Loved by educators</span><span>✓ Privacy-first</span><span>✓ Save time teaching</span>
        </div>
      </div>
      <div style={{ flex: 1, background: '#fff', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-popover)', padding: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>Welcome back, Ms. Rivera 👋</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {['12 Quests', '76% Mastery', '1,248 Rewards'].map((s) => (
            <div key={s} style={{ flex: 1, background: 'var(--surface-page)', borderRadius: 'var(--radius-md)', padding: 12, fontSize: 13, fontWeight: 'var(--fw-semibold)' }}>{s}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Features() {
  const items = [
    { icon: '⚑', title: 'Quest-Based Learning', body: 'Turn topics into engaging quests. Students complete challenges, earn XP, and unlock new adventures.', tone: 'indigo' },
    { icon: '◎', title: 'Mastery Tracking', body: "Track understanding at the concept level. Ensure mastery before moving forward—no one gets left behind.", tone: 'teal' },
    { icon: '▲', title: 'Teacher Analytics', body: 'Powerful insights help you personalize instruction and celebrate progress.', tone: 'amber' },
  ];
  const tones = { indigo: { bg: 'var(--indigo-50)', fg: 'var(--brand-primary)' }, teal: { bg: 'var(--teal-50)', fg: 'var(--teal-600)' }, amber: { bg: 'var(--amber-50)', fg: 'var(--amber-600)' } };
  return (
    <div style={{ display: 'flex', gap: 20, padding: '40px 48px' }}>
      {items.map((it) => {
        const t = tones[it.tone];
        return (
          <div key={it.title} style={{ flex: 1, background: '#fff', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: t.bg, color: t.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 16 }}>{it.icon}</div>
            <div style={{ fontSize: 17, fontWeight: 'var(--fw-semibold)', marginBottom: 8 }}>{it.title}</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 'var(--lh-relaxed)' }}>{it.body}</div>
          </div>
        );
      })}
    </div>
  );
}

function Testimonial() {
  const [idx, setIdx] = React.useState(0);
  const quotes = [
    { text: 'QuestLearn transformed my classroom. Students are more engaged, and I finally have data that helps me teach smarter, not harder.', name: 'Jamie L.', role: 'High School Science Teacher' },
    { text: 'My students race to finish quests instead of dreading homework. Mastery tracking shows me exactly who needs help.', name: 'Priya R.', role: 'Middle School Math Teacher' },
  ];
  const q = quotes[idx];
  return (
    <div style={{ background: 'var(--surface-sunken)', padding: '48px 48px', display: 'flex', alignItems: 'center', gap: 20 }}>
      <div style={{ fontSize: 40, color: 'var(--indigo-300)', fontFamily: 'var(--font-display)' }}>"</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 18, color: 'var(--text-primary)', lineHeight: 'var(--lh-relaxed)' }}>{q.text}</div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 12 }}>— {q.name}, {q.role}</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setIdx((idx - 1 + quotes.length) % quotes.length)} style={{ border: '1px solid var(--border-default)', background: '#fff', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer' }}>‹</button>
        <button onClick={() => setIdx((idx + 1) % quotes.length)} style={{ border: '1px solid var(--border-default)', background: '#fff', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer' }}>›</button>
      </div>
    </div>
  );
}

function Pricing() {
  const tiers = [
    { name: 'Free', desc: 'Great for getting started.', price: '$0', period: '/forever' },
    { name: 'Teacher', desc: 'Everything you need for one classroom.', price: '$9', period: '/mo' },
    { name: 'School', desc: 'For departments and small schools.', price: '$49', period: '/mo', popular: true },
    { name: 'District', desc: 'For growing districts and orgs.', price: 'Custom', period: '/year' },
  ];
  return (
    <div style={{ padding: '56px 48px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 12, fontWeight: 'var(--fw-semibold)', color: 'var(--brand-primary)', letterSpacing: '.05em', textTransform: 'uppercase' }}>Simple, Transparent Pricing</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 'var(--fw-semibold)', marginTop: 8 }}>Find the plan that fits your teaching goals.</h2>
      </div>
      <div style={{ display: 'flex', gap: 20 }}>
        {tiers.map((t) => (
          <div key={t.name} style={{
            flex: 1, background: '#fff', borderRadius: 'var(--radius-lg)', padding: 24,
            border: t.popular ? '2px solid var(--brand-primary)' : '1px solid var(--border-default)', position: 'relative',
          }}>
            {t.popular && <Badge tone="brand">Most Popular</Badge>}
            <div style={{ fontSize: 16, fontWeight: 'var(--fw-semibold)', marginTop: t.popular ? 10 : 0 }}>{t.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, minHeight: 34 }}>{t.desc}</div>
            <div style={{ marginTop: 16 }}>
              <span style={{ fontSize: 32, fontWeight: 'var(--fw-bold)' }}>{t.price}</span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}> {t.period}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketingSite() {
  return (
    <div style={{ overflow: 'auto' }}>
      <div style={{ fontFamily: 'var(--font-ui)', background: 'var(--surface-page)', minWidth: 1280 }}>
        <NavBar /><Hero /><Features /><Testimonial /><Pricing />
      </div>
    </div>
  );
}

window.MarketingSite = MarketingSite;
