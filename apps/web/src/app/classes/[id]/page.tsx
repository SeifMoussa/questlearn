"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Input } from "@questlearn/design-system";
import { FormField } from "@/components/FormField";
import { useAuth } from "@/lib/auth-context";
import {
  ApiError,
  SchoolClass,
  addRosterEntry,
  getClass,
  removeRosterEntry,
  rotateJoinCode,
  updateClass,
} from "@/lib/api";

type LoadState = "loading" | "loaded" | "not-found" | "error";

export default function ClassDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const classId = params.id;
  const { status, accessToken } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [cls, setCls] = useState<SchoolClass | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const [rosterName, setRosterName] = useState("");
  const [rosterEmail, setRosterEmail] = useState("");
  const [rosterErrors, setRosterErrors] = useState<Record<string, string>>({});
  const [rosterSubmitting, setRosterSubmitting] = useState(false);

  const loadClass = useCallback(() => {
    if (!accessToken) return;
    setLoadState("loading");
    getClass(accessToken, classId)
      .then((result) => {
        setCls(result);
        setNameDraft(result.name);
        setLoadState("loaded");
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 404) {
          setLoadState("not-found");
        } else {
          setErrorMessage(error instanceof ApiError ? error.message : "Could not load this class.");
          setLoadState("error");
        }
      });
  }, [accessToken, classId]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && accessToken) {
      loadClass();
    }
  }, [status, accessToken, loadClass]);

  async function saveName() {
    if (!accessToken || !cls) return;
    if (!nameDraft.trim()) return;
    const updated = await updateClass(accessToken, cls.id, { name: nameDraft });
    setCls(updated);
    setEditingName(false);
  }

  async function toggleArchive() {
    if (!accessToken || !cls) return;
    const archiving = !cls.archivedAt;
    if (archiving && !confirm(`Archive "${cls.name}"? You can still view it, but it won't show in your active class list.`)) {
      return;
    }
    const updated = await updateClass(accessToken, cls.id, { archived: archiving });
    setCls(updated);
  }

  async function onRotateJoinCode() {
    if (!accessToken || !cls) return;
    if (!confirm("Rotate the join code? The current code will stop working immediately.")) {
      return;
    }
    const updated = await rotateJoinCode(accessToken, cls.id);
    setCls(updated);
  }

  async function onAddRoster(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !cls) return;

    if (!rosterName.trim()) {
      setRosterErrors({ name: "Name is required." });
      return;
    }
    setRosterErrors({});
    setRosterSubmitting(true);
    try {
      await addRosterEntry(accessToken, cls.id, {
        name: rosterName,
        email: rosterEmail.trim() || undefined,
      });
      setRosterName("");
      setRosterEmail("");
      loadClass();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors) {
        const fieldErrors: Record<string, string> = {};
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          fieldErrors[field] = messages[0];
        }
        setRosterErrors(fieldErrors);
      } else {
        setRosterErrors({ name: error instanceof ApiError ? error.message : "Could not add this entry." });
      }
    } finally {
      setRosterSubmitting(false);
    }
  }

  async function onRemoveRoster(rosterId: string) {
    if (!accessToken || !cls) return;
    await removeRosterEntry(accessToken, cls.id, rosterId);
    loadClass();
  }

  if (status === "loading" || loadState === "loading") {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="class-detail-loading">Loading class…</p>
      </main>
    );
  }

  if (status !== "authenticated") {
    return null;
  }

  if (loadState === "not-found") {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: "var(--fw-semibold)" }}>
          Class not found
        </h1>
        <p data-testid="class-not-found" style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>
          This class doesn&apos;t exist, or isn&apos;t one of yours.
        </p>
        <Link href="/classes">Back to classes</Link>
      </main>
    );
  }

  if (loadState === "error" || !cls) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p role="alert" data-testid="class-detail-error" style={{ color: "var(--status-at-risk-fg, #b42318)" }}>
          {errorMessage ?? "Something went wrong."}
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: 48, fontFamily: "var(--font-ui)", background: "var(--surface-page)", minHeight: "100vh" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href="/classes">Back to classes</Link>
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 16 }}>
        {editingName ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, maxWidth: 420 }}>
            <Input id="rename" value={nameDraft} onChange={setNameDraft} />
            <Button variant="primary" size="sm" onClick={saveName}>
              Save
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setEditingName(false); setNameDraft(cls.name); }}>
              Cancel
            </Button>
          </div>
        ) : (
          <h1
            data-testid="class-name"
            style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: "var(--fw-semibold)", margin: 0 }}
          >
            {cls.name}
          </h1>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          {!editingName && (
            <Button variant="secondary" size="sm" onClick={() => setEditingName(true)}>
              Rename
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={toggleArchive}>
            {cls.archivedAt ? "Un-archive" : "Archive"}
          </Button>
        </div>
      </div>

      {cls.archivedAt && (
        <Badge tone="neutral">Archived</Badge>
      )}

      <section
        style={{
          background: "var(--surface-card)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-card)",
          padding: 20,
          marginTop: 24,
          maxWidth: 480,
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", margin: "0 0 8px" }}>Join code</h2>
        <p data-testid="join-code" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 28, letterSpacing: 4, margin: "0 0 4px" }}>
          {cls.joinCode}
        </p>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
          Expires {new Date(cls.joinCodeExpiresAt).toLocaleDateString()}
        </p>
        <Button variant="secondary" size="sm" onClick={onRotateJoinCode}>
          Rotate code
        </Button>
      </section>

      <section style={{ marginTop: 32, maxWidth: 560 }}>
        <h2 style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", margin: "0 0 12px" }}>
          Roster ({cls.roster.length})
        </h2>

        {cls.roster.length === 0 ? (
          <p data-testid="roster-empty" style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            No students added yet.
          </p>
        ) : (
          <ul data-testid="roster-list" style={{ listStyle: "none", padding: 0, margin: "0 0 20px" }}>
            {cls.roster.map((entry) => (
              <li
                key={entry.id}
                data-testid="roster-entry"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "var(--surface-card)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 14px",
                  marginBottom: 8,
                }}
              >
                <div>
                  <p style={{ margin: 0, fontSize: 14, color: "var(--text-primary)" }}>{entry.name}</p>
                  {entry.email && (
                    <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>{entry.email}</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => onRemoveRoster(entry.id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={onAddRoster} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <FormField label="Student name" htmlFor="roster-name" error={rosterErrors.name}>
            <Input id="roster-name" value={rosterName} onChange={setRosterName} placeholder="Avery Kim" />
          </FormField>
          <FormField label="Email (optional)" htmlFor="roster-email" error={rosterErrors.email}>
            <Input id="roster-email" type="email" value={rosterEmail} onChange={setRosterEmail} placeholder="avery@example.com" />
          </FormField>
          <Button type="submit" variant="primary" size="md" disabled={rosterSubmitting}>
            {rosterSubmitting ? "Adding…" : "Add"}
          </Button>
        </form>
      </section>
    </main>
  );
}
