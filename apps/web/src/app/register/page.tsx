"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Button, Input } from "@questlearn/design-system";
import { FormField } from "@/components/FormField";
import { ApiError, register } from "@/lib/api";

interface FormState {
  name: string;
  email: string;
  password: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = "Name is required.";
  if (!EMAIL_RE.test(form.email)) errors.email = "Enter a valid email address.";
  if (form.password.length < 10) {
    errors.password = "Password must be at least 10 characters.";
  } else if (!/[a-zA-Z]/.test(form.password) || !/[0-9]/.test(form.password)) {
    errors.password = "Password must contain at least one letter and one number.";
  }
  return errors;
}

export default function RegisterPage() {
  const [form, setForm] = useState<FormState>({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBanner(null);

    const clientErrors = validate(form);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    setStatus("submitting");
    try {
      await register(form);
      setStatus("success");
    } catch (error) {
      setStatus("idle");
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

  if (status === "success") {
    return (
      <main style={{ maxWidth: 420, margin: "80px auto", padding: "0 24px", fontFamily: "var(--font-ui)" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: "var(--fw-semibold)" }}>
          Check your email
        </h1>
        <p data-testid="register-success" style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: "var(--lh-relaxed)" }}>
          We sent a verification link to <strong>{form.email}</strong>. In
          development, no real email is sent — check the API server log for
          the verification token, or open{" "}
          <Link href="/verify-email">the verify page</Link> once you have it.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: "0 24px", fontFamily: "var(--font-ui)" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: "var(--fw-semibold)", marginBottom: 4 }}>
        Create your teacher account
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24 }}>
        Registration in this module creates a teacher account and a new
        workspace for you.
      </p>

      {banner && (
        <p role="alert" data-testid="register-error-banner" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13, marginBottom: 16 }}>
          {banner}
        </p>
      )}

      <form onSubmit={onSubmit} noValidate>
        <FormField label="Full Name" htmlFor="name" error={errors.name}>
          <Input id="name" name="name" autoComplete="name" value={form.name} onChange={(v) => update("name", v)} placeholder="Jamie Rivera" />
        </FormField>
        <FormField label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" name="email" type="email" autoComplete="email" value={form.email} onChange={(v) => update("email", v)} placeholder="you@school.edu" />
        </FormField>
        <FormField label="Password" htmlFor="password" error={errors.password}>
          <Input id="password" name="password" type="password" autoComplete="new-password" value={form.password} onChange={(v) => update("password", v)} placeholder="At least 10 characters" />
        </FormField>

        <Button type="submit" variant="primary" size="lg" disabled={status === "submitting"}>
          {status === "submitting" ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 18 }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}
