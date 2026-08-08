"use client";

import { FormEvent, useState } from "react";
import { Button, Input } from "@questlearn/design-system";
import { FormField } from "@/components/FormField";
import { ApiError, forgotPassword } from "@/lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!EMAIL_RE.test(email)) {
      setError("Enter a valid email address.");
      return;
    }

    setStatus("submitting");
    try {
      await forgotPassword(email);
      setStatus("success");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: "0 24px", fontFamily: "var(--font-ui)", textAlign: "center" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: "var(--fw-semibold)", margin: "0 0 4px" }}>
        Reset your password
      </h1>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 24px" }}>
        Enter your email and we&rsquo;ll send you a reset link.
      </p>

      {status === "success" ? (
        <p data-testid="forgot-password-success" style={{ fontSize: 14, color: "var(--text-secondary)" }}>
          If an account with that email exists, a password reset link has
          been sent. In development, check the API server log for the token.
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate style={{ textAlign: "left" }}>
          {error && (
            <p role="alert" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13, marginBottom: 16 }}>
              {error}
            </p>
          )}
          <FormField label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" value={email} onChange={setEmail} placeholder="you@school.edu" />
          </FormField>
          <Button type="submit" variant="primary" size="lg" disabled={status === "submitting"}>
            {status === "submitting" ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </main>
  );
}
