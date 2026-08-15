"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@questlearn/design-system";
import { FormField } from "@/components/FormField";
import { useAuth } from "@/lib/auth-context";
import { ApiError, joinClass } from "@/lib/api";

interface FormState {
  joinCode: string;
  name: string;
  email: string;
  password: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Public redemption form — handles two cases behind one form. An
 * already-authenticated learner (joining a second class) only sees
 * the join-code field; an anonymous visitor also fills in
 * name/email/password to create a brand-new learner account in the
 * same step. Both paths hit the same `/classes/join` endpoint (see
 * apps/api's JoinController) and land on /dashboard on success.
 */
function JoinPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, user, accessToken, applySession } = useAuth();
  const alreadyLearner = status === "authenticated" && user?.role === "learner";

  const [form, setForm] = useState<FormState>({
    joinCode: (searchParams.get("code") ?? "").toUpperCase(),
    name: "",
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!form.joinCode.trim()) errs.joinCode = "Join code is required.";
    if (!alreadyLearner) {
      if (!form.name.trim()) errs.name = "Name is required.";
      if (!EMAIL_RE.test(form.email)) errs.email = "Enter a valid email address.";
      if (form.password.length < 10) errs.password = "Password must be at least 10 characters.";
    }
    return errs;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBanner(null);

    const clientErrors = validate();
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    setSubmitting(true);
    try {
      if (alreadyLearner) {
        await joinClass({ joinCode: form.joinCode }, accessToken ?? undefined);
      } else {
        const result = await joinClass({
          joinCode: form.joinCode,
          name: form.name,
          email: form.email,
          password: form.password,
        });
        if (result.accessToken && result.user) {
          applySession(result.accessToken, result.user);
        }
      }
      router.push("/dashboard");
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiError && error.fieldErrors) {
        const fieldErrors: Record<string, string> = {};
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          fieldErrors[field] = messages[0];
        }
        setErrors(fieldErrors);
      } else if (error instanceof ApiError) {
        setBanner(error.message);
      } else {
        setBanner("Something went wrong. Please try again.");
      }
    }
  }

  if (status === "loading") {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: "0 24px", fontFamily: "var(--font-ui)" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: "var(--fw-semibold)", marginBottom: 4 }}>
        Join a class
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24 }}>
        {alreadyLearner
          ? "Enter another class's join code to add it to your dashboard."
          : "Enter the join code your teacher gave you. This creates your learner account."}
      </p>

      {banner && (
        <p role="alert" data-testid="join-error-banner" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13, marginBottom: 16 }}>
          {banner}
        </p>
      )}

      <form onSubmit={onSubmit} noValidate>
        <FormField label="Join code" htmlFor="joinCode" error={errors.joinCode}>
          <Input
            id="joinCode"
            name="joinCode"
            value={form.joinCode}
            onChange={(v) => update("joinCode", v.toUpperCase())}
            placeholder="ABCD2345"
          />
        </FormField>

        {!alreadyLearner && (
          <>
            <FormField label="Full Name" htmlFor="name" error={errors.name}>
              <Input id="name" name="name" autoComplete="name" value={form.name} onChange={(v) => update("name", v)} placeholder="Avery Kim" />
            </FormField>
            <FormField label="Email" htmlFor="email" error={errors.email}>
              <Input id="email" name="email" type="email" autoComplete="email" value={form.email} onChange={(v) => update("email", v)} placeholder="avery@example.com" />
            </FormField>
            <FormField label="Password" htmlFor="password" error={errors.password}>
              <Input id="password" name="password" type="password" autoComplete="new-password" value={form.password} onChange={(v) => update("password", v)} placeholder="At least 10 characters" />
            </FormField>
          </>
        )}

        <Button type="submit" variant="primary" size="lg" disabled={submitting}>
          {submitting ? "Joining…" : "Join class"}
        </Button>
      </form>

      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 18 }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinPageInner />
    </Suspense>
  );
}
