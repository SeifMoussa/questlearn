/**
 * Pure reporting math and CSV encoding (Master Spec §12/§14, functional
 * requirement #10). Kept free of any database/HTTP concern so it's
 * unit-testable in isolation — see `report-formula.spec.ts`, mirroring
 * the split already established by `mastery-formula.ts`,
 * `gamification-formula.ts`, and `quest-formula.ts`.
 *
 * Every rate here returns `null` (never 0, never `NaN`) when its
 * denominator is zero — "no data yet" and "zero percent" are different
 * facts, and collapsing them would misreport an empty assignment as a
 * 0% completion rate rather than "nothing to report yet."
 */

/** Fraction of `assigned` that `submitted`, or null if nothing was assigned. */
export function completionRate(assigned: number, submitted: number): number | null {
  if (assigned <= 0) return null;
  return submitted / assigned;
}

/** Mean of a list of 0-1 attempt scores, or null for an empty list. */
export function averageScore(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

/** Fraction of `total` graded responses that were correct, or null if there were none. */
export function correctRate(correct: number, total: number): number | null {
  if (total <= 0) return null;
  return correct / total;
}

/** Fraction of `total` graded responses where the hint was viewed, or null if there were none. */
export function hintViewRate(hintViewed: number, total: number): number | null {
  if (total <= 0) return null;
  return hintViewed / total;
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number;
}

/**
 * RFC 4180-style CSV encoding: a field is quoted (with internal quotes
 * doubled) only when it contains a comma, quote, or newline — anything
 * simpler is left bare, matching how a spreadsheet application writes
 * its own output. `\r\n` line endings throughout, including after the
 * final row, per the RFC.
 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const escape = (raw: string | number): string => {
    const value = String(raw);
    if (/["\n\r,]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const lines = [columns.map((c) => escape(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escape(c.value(row))).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
