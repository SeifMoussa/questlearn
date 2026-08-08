"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@questlearn/design-system";
import { FormField } from "@/components/FormField";
import { ApiError, resetPassword } from "@/lib/api";

function validatePassword(password: string, confirm: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (password.length < 10) {
    errors.password = "Password must be at least 10 characters.";
  } else if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    errors.password = "Password must contain at least one letter and one number.";
  }
  if (confirm !== password) errors.confirm = "Passwords do not match.";
  return errors;
}

function ResetPasswordInner() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBanner(null);

    const clientErrors = validatePassword(password, confirm);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    setStatus("submitting");
    try {
      await resetPassword({ token, password });
      setStatus("success");
    } catch (error) {
      setStatus("idle");
      setBanner(error instanceof ApiError ? error.message : "Something went wrong.");
    }
  }

  if (status === "success") {
    return (
      <main style={{ maxWidth: 420, margin: "80px auto", padding: "0 24px", fontFamily: "var(--font-ui)", textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: "var(--fw-semibold)" }}>
          Password updated
        </h1>
        <p data-testid="reset-password-success" style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          You can now <Link href="/login">sign in</Link> with your new password.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: "0 24px", fontFamily: "var(--font-ui)", textAlign: "center" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: "var(--fw-semibold)", margin: "0 0 4px" }}>
        Choose a new password
      </h1>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 24px" }}>
        Paste the reset token from the API server log (no real email is sent
        in development).
      </p>
      {banner && (
        <p role="alert" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13, marginBottom: 16 }}>
          {banner}
        </p>
      )}
      <form onSubmit={onSubmit} noValidate style={{ textAlign: "left" }}>
        <FormField label="Reset token" htmlFor="token">
          <Input id="token" name="token" value={token} onChange={setToken} placeholder="Paste your token" />
        </FormField>
        <FormField label="New Password" htmlFor="password" error={errors.password}>
          <Input id="password" name="password" type="password" autoComplete="new-password" value={password} onChange={setPassword} placeholder="At least 10 characters" />
        </FormField>
        <FormField label="Confirm New Password" htmlFor="confirm" error={errors.confirm}>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" value={confirm} onChange={setConfirm} placeholder="Re-enter your password" />
        </FormField>
        <Button type="submit" variant="primary" size="lg" disabled={status === "submitting" || !token}>
          {status === "submitting" ? "Updating…" : "Update Password"}
        </Button>
      </form>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
