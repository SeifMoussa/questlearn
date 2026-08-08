import Link from "next/link";
import { Badge, Button } from "@questlearn/design-system";

const FEATURES = [
  {
    icon: "⚑",
    title: "Quest-Based Learning",
    body: "Turn topics into engaging quests. Students complete challenges, earn XP, and unlock new adventures.",
  },
  {
    icon: "◎",
    title: "Mastery Tracking",
    body: "Track understanding at the concept level. Ensure mastery before moving forward, so no one gets left behind.",
  },
  {
    icon: "▲",
    title: "Teacher Analytics",
    body: "Powerful insights help you personalize instruction and celebrate real progress.",
  },
];

const TIERS = [
  { name: "Free", desc: "Great for getting started.", price: "$0", period: "/forever" },
  { name: "Teacher", desc: "Everything you need for one classroom.", price: "$9", period: "/mo" },
  { name: "School", desc: "For departments and small schools.", price: "$49", period: "/mo", popular: true },
  { name: "District", desc: "For growing districts and orgs.", price: "Custom", period: "/year" },
];

export default function MarketingPage() {
  return (
    <main style={{ fontFamily: "var(--font-ui)", background: "var(--surface-page)" }}>
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 48px",
          borderBottom: "1px solid var(--border-default)",
          background: "#fff",
        }}
      >
        <span style={{ fontSize: 20, fontWeight: "var(--fw-bold)" }}>QuestLearn</span>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/login">
            <Button variant="secondary" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/register">
            <Button variant="primary" size="sm">
              Start Free
            </Button>
          </Link>
        </div>
      </nav>

      <section
        style={{
          padding: "56px 48px",
          background: "linear-gradient(180deg,#F8F7FE,#fff)",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: "var(--fw-semibold)",
            fontSize: 44,
            lineHeight: "var(--lh-tight)",
            color: "var(--text-primary)",
            margin: 0,
            maxWidth: 640,
          }}
        >
          Turn every lesson into a{" "}
          <span style={{ color: "var(--brand-primary)" }}>learning quest</span>.
        </h1>
        <p
          style={{
            fontSize: 17,
            color: "var(--text-secondary)",
            marginTop: 20,
            maxWidth: 480,
            lineHeight: "var(--lh-relaxed)",
          }}
        >
          Create interactive lessons, assign quests, reward meaningful
          progress, and track concept mastery.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
          <Link href="/register">
            <Button variant="primary" size="lg">
              Start as a Teacher
            </Button>
          </Link>
        </div>
      </section>

      <section style={{ display: "flex", gap: 20, padding: "40px 48px", flexWrap: "wrap" }}>
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            style={{
              flex: "1 1 240px",
              background: "#fff",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-lg)",
              padding: 24,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "var(--indigo-50)",
                color: "var(--brand-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                marginBottom: 16,
              }}
            >
              {feature.icon}
            </div>
            <div style={{ fontSize: 17, fontWeight: "var(--fw-semibold)", marginBottom: 8 }}>
              {feature.title}
            </div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: "var(--lh-relaxed)" }}>
              {feature.body}
            </div>
          </div>
        ))}
      </section>

      <section
        style={{
          background: "var(--surface-sunken)",
          padding: "48px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 40, color: "var(--indigo-300)", fontFamily: "var(--font-display)" }}>
          &ldquo;
        </div>
        <div style={{ flex: "1 1 320px" }}>
          <p style={{ fontSize: 18, color: "var(--text-primary)", lineHeight: "var(--lh-relaxed)", margin: 0 }}>
            QuestLearn transformed my classroom. Students are more engaged, and
            I finally have data that helps me teach smarter, not harder.
          </p>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 12 }}>
            — Jamie L., High School Science Teacher
          </p>
        </div>
      </section>

      <section style={{ padding: "56px 48px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: "var(--fw-semibold)",
              color: "var(--brand-primary)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Simple, Transparent Pricing
          </div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: "var(--fw-semibold)", marginTop: 8 }}>
            Find the plan that fits your teaching goals.
          </h2>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              style={{
                flex: "1 1 220px",
                background: "#fff",
                borderRadius: "var(--radius-lg)",
                padding: 24,
                border: tier.popular ? "2px solid var(--brand-primary)" : "1px solid var(--border-default)",
                position: "relative",
              }}
            >
              {tier.popular && <Badge tone="brand">Most Popular</Badge>}
              <div style={{ fontSize: 16, fontWeight: "var(--fw-semibold)", marginTop: tier.popular ? 10 : 0 }}>
                {tier.name}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, minHeight: 34 }}>
                {tier.desc}
              </div>
              <div style={{ marginTop: 16 }}>
                <span style={{ fontSize: 32, fontWeight: "var(--fw-bold)" }}>{tier.price}</span>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}> {tier.period}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer
        style={{
          padding: "24px 48px",
          borderTop: "1px solid var(--border-default)",
          fontSize: 13,
          color: "var(--text-secondary)",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>QuestLearn — a portfolio project.</span>
        <Link href="/status" style={{ color: "var(--text-secondary)" }}>
          System status
        </Link>
      </footer>
    </main>
  );
}
