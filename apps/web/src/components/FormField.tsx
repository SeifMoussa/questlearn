"use client";

import { ReactNode } from "react";

/**
 * The design system's Input has no built-in label/error slot, so this
 * thin wrapper supplies the label + per-field error markup every auth
 * form needs, styled with the same token variables Input uses.
 */
export function FormField({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label
        htmlFor={htmlFor}
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: "var(--fw-medium)",
          color: "var(--text-primary)",
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
      {error && (
        <p
          role="alert"
          style={{
            color: "var(--status-at-risk-fg, #b42318)",
            fontSize: 12,
            marginTop: 6,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
