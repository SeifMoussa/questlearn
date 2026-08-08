"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@questlearn/design-system";
import { FormField } from "@/components/FormField";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBanner(null);

    const clientErrors: Record<string, string> = {};
    if (!EMAIL_RE.test(email)) clientErrors.email = "Enter a valid email address.";
    if (!password) clientErrors.password = "Password is required.";
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    setSubmitting(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (error) {
      if (error instanceof ApiError) {
        setBanner(error.message);
      } else {
        setBanner("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: "0 24px", fontFamily: "var(--font-ui)" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: "var(--fw-semibold)", marginBottom: 24 }}>
        Sign in to QuestLearn
      </h1>

      {banner && (
        <p role="alert" data-testid="login-error-banner" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13, marginBottom: 16 }}>
          {banner}
        </p>
      )}

      <form onSubmit={onSubmit} noValidate>
        <FormField label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" name="email" type="email" autoComplete="email" value={email} onChange={setEmail} placeholder="you@school.edu" />
        </FormField>
        <FormField label="Password" htmlFor="password" error={errors.password}>
          <Input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={setPassword} placeholder="Your password" />
        </FormField>

        <div style={{ textAlign: "right", fontSize: 13, marginBottom: 18, marginTop: -8 }}>
          <Link href="/forgot-password">Forgot password?</Link>
        </div>

        <Button type="submit" variant="primary" size="lg" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 18 }}>
        Need an account? <Link href="/register">Create one</Link>
      </p>
    </main>
  );
}
