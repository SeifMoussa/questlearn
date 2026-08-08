"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@questlearn/design-system";
import { FormField } from "@/components/FormField";
import { ApiError, verifyEmail } from "@/lib/api";

type State =
  | { kind: "form" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [state, setState] = useState<State>({ kind: "form" });

  async function submit(candidateToken: string) {
    setState({ kind: "submitting" });
    try {
      await verifyEmail(candidateToken);
      setState({ kind: "success" });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Something went wrong.";
      setState({ kind: "error", message });
    }
  }

  useEffect(() => {
    const fromUrl = searchParams.get("token");
    if (fromUrl) {
      void submit(fromUrl);
    }
    // Only auto-submit once, on first load with a token in the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(token);
  }

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: "0 24px", fontFamily: "var(--font-ui)", textAlign: "center" }}>
      {state.kind === "success" ? (
        <>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: "var(--fw-semibold)" }}>
            Email verified
          </h1>
          <p data-testid="verify-success" style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            You can now <Link href="/login">sign in</Link>.
          </p>
        </>
      ) : (
        <>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: "var(--fw-semibold)", margin: "0 0 8px" }}>
            Verify your email
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px" }}>
            Paste the verification token from the API server log (no real
            email is sent in development).
          </p>
          {state.kind === "error" && (
            <p role="alert" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13, marginBottom: 16 }}>
              {state.message}
            </p>
          )}
          <form onSubmit={onSubmit} noValidate style={{ textAlign: "left" }}>
            <FormField label="Verification token" htmlFor="token">
              <Input id="token" name="token" value={token} onChange={setToken} placeholder="Paste your token" />
            </FormField>
            <Button type="submit" variant="primary" size="md" disabled={state.kind === "submitting" || !token}>
              {state.kind === "submitting" ? "Verifying…" : "Verify email"}
            </Button>
          </form>
        </>
      )}
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
