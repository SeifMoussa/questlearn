"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Input } from "@questlearn/design-system";
import { FormField } from "@/components/FormField";
import { useAuth } from "@/lib/auth-context";
import { ApiError, Concept, archiveConcept, createConcept, listConcepts } from "@/lib/api";

/**
 * Minimal teacher CRUD for concepts — not in the screenshot budget
 * (§14 only requires the learner/teacher mastery *views*), so this
 * stays plain and functional rather than polished: name + description
 * fields, a flat list, and an archive toggle.
 */
export default function ConceptsPage() {
  const router = useRouter();
  const { status, accessToken } = useAuth();

  const [concepts, setConcepts] = useState<Concept[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    if (!accessToken) return;
    listConcepts(accessToken)
      .then((result) => setConcepts(result))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load concepts."));
  }, [accessToken]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && accessToken) {
      load();
    }
  }, [status, accessToken, load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setFieldErrors({});
    if (!name.trim()) {
      setFieldErrors({ name: "Concept name is required." });
      return;
    }
    setSubmitting(true);
    try {
      await createConcept(accessToken, { name: name.trim(), description: description.trim() || undefined });
      setName("");
      setDescription("");
      load();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        const flat: Record<string, string> = {};
        for (const [field, messages] of Object.entries(err.fieldErrors)) flat[field] = messages[0];
        setFieldErrors(flat);
      } else {
        setError(err instanceof ApiError ? err.message : "Could not create concept.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onArchive(concept: Concept) {
    if (!accessToken) return;
    if (!confirm(`Archive "${concept.name}"? It will no longer be available for tagging new questions.`)) return;
    await archiveConcept(accessToken, concept.id);
    load();
  }

  if (status === "loading" || (status === "authenticated" && concepts === null && !error)) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="concepts-loading">Loading concepts…</p>
      </main>
    );
  }

  if (status !== "authenticated") {
    return null;
  }

  return (
    <main style={{ padding: 48, fontFamily: "var(--font-ui)", background: "var(--surface-page)", minHeight: "100vh" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href="/dashboard">Back to dashboard</Link>
      </p>

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: "var(--fw-semibold)", margin: "0 0 8px" }}>
        Concepts
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24, maxWidth: 520 }}>
        Concepts are mastery tags you attach to questions from the question
        bank. Tagging a question doesn&apos;t create a new version — edit
        wording freely without re-tagging.
      </p>

      {error && (
        <p role="alert" data-testid="concepts-error" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13, marginBottom: 16 }}>
          {error}
        </p>
      )}

      <form
        onSubmit={onCreate}
        style={{
          background: "var(--surface-card)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-card)",
          padding: 20,
          maxWidth: 480,
          marginBottom: 32,
        }}
      >
        <FormField label="Name" htmlFor="concept-name" error={fieldErrors.name}>
          <Input id="concept-name" value={name} onChange={setName} placeholder="e.g. Fractions" />
        </FormField>
        <FormField label="Description (optional)" htmlFor="concept-description" error={fieldErrors.description}>
          <Input id="concept-description" value={description} onChange={setDescription} placeholder="What this concept covers" />
        </FormField>
        <Button type="submit" variant="primary" size="md" disabled={submitting}>
          {submitting ? "Creating…" : "Create concept"}
        </Button>
      </form>

      {concepts && concepts.length === 0 && (
        <p data-testid="concepts-empty" style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          No concepts yet. Create one above, then tag it onto a question from
          that question&apos;s detail page.
        </p>
      )}

      {concepts && concepts.length > 0 && (
        <ul data-testid="concepts-list" style={{ listStyle: "none", padding: 0, maxWidth: 480 }}>
          {concepts.map((concept) => (
            <li
              key={concept.id}
              data-testid="concept-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                background: "var(--surface-card)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-card)",
                padding: 16,
                marginBottom: 10,
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 15, color: "var(--text-primary)" }}>{concept.name}</p>
                {concept.description && (
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>{concept.description}</p>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {concept.archivedAt && <Badge tone="neutral">Archived</Badge>}
                <Button variant="ghost" size="sm" onClick={() => onArchive(concept)}>
                  Archive
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
