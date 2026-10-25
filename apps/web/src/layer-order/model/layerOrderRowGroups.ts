/**
 * How the constraints list groups its constraints into rows (D21, "The
 * list"): stored one constraint each, as the record and the engine hold
 * them, and shown one row per subject and verb, "D in front of H, K".
 *
 * - A row sits at the place of its earliest constraint, and a later Add for
 *   the same subject and verb joins it.
 * - The verb is paper-relative here (whether the subject lies nearer the
 *   front), so a row is the same row from either side; read from the side
 *   shown, its verb flips for every object at once. It is not the sign: one
 *   verb from one side is either sign, by how each object faces, and
 *   grouping by sign would split "D in front of H, K" whenever H and K face
 *   different ways.
 * - Committed and carried rows never share a row, and carried rows group
 *   only within one status, so a row never mixes statuses. A carried row
 *   whose subject or object no longer exists, whose two faces are one face
 *   now, or whose reason names its own object (an ambiguous object) stays a
 *   row of its own: its reason would not hold for the others.
 *
 * Pure: no React, no store, no engine calls.
 */
import { constraintVerb, type LayerConstraint, type LayerFace } from './layerOrderEngineFacts';
import type { LayerCarriedRow, LayerFigure, LayerRow, LayerRows } from './layerOrderState';

/** One row of the list: one stored constraint, or several with one subject and verb. */
export interface LayerRowGroup {
  /** The earliest member's id: the row's key. */
  readonly id: number;
  readonly kind: LayerRow['kind'];
  /** The stored constraints it shows, in their objects' letter order. */
  readonly members: readonly LayerRow[];
}

/** A row's subject, object and sign, whichever kind it is; a face that no longer exists is null. */
export function rowParts(row: LayerRow): { subject: LayerFace | null; object: LayerFace | null; sign: 1 | -1 } {
  if (row.kind === 'committed') {
    const [subject, object, sign] = row.constraint;
    return { subject, object, sign };
  }
  const { subject, object, sign } = row.facts;
  return { subject, object, sign };
}

function nearerTheFront(constraint: LayerConstraint, figure: LayerFigure | null): boolean {
  return constraintVerb(constraint, 'front', figure?.frontUp[constraint[1]] === 1) === 'in_front_of';
}

function carriedKey(row: LayerCarriedRow, figure: LayerFigure | null): string | null {
  const { status, subject, object, sign, subjectState } = row.facts;
  if (subject === null || object === null || subject === object) return null;
  if (status.status === 'ambiguous' && subjectState !== 'ambiguous') return null;
  const cause = status.status === 'gone' ? status.cause : '';
  return `carried:${status.status}:${cause}:${subject}:${nearerTheFront([subject, object, sign], figure)}`;
}

function groupKey(row: LayerRow, figure: LayerFigure | null): string | null {
  if (row.kind === 'carried') return carriedKey(row, figure);
  return `committed:${row.constraint[0]}:${nearerTheFront(row.constraint, figure)}`;
}

/** The list's rows, in its order: the committed ones, then the carried ones, each at its earliest constraint's place. */
export function rowGroupsOf(rows: LayerRows, figure: LayerFigure | null): LayerRowGroup[] {
  const groups: { id: number; kind: LayerRow['kind']; members: LayerRow[] }[] = [];
  const byKey = new Map<string, (typeof groups)[number]>();
  for (const row of [...rows.committed, ...rows.carried]) {
    const key = groupKey(row, figure);
    const found = key === null ? undefined : byKey.get(key);
    if (found) {
      found.members.push(row);
      continue;
    }
    const group = { id: row.id, kind: row.kind, members: [row] };
    groups.push(group);
    if (key !== null) byKey.set(key, group);
  }
  const rank = (row: LayerRow) => {
    const { object } = rowParts(row);
    return object === null ? Infinity : (figure?.letterRank[object] ?? object);
  };
  return groups.map((group) =>
    group.members.length < 2
      ? group
      : { ...group, members: [...group.members].sort((a, b) => rank(a) - rank(b) || a.id - b.id) }
  );
}

/** The row holding stored constraint `id`, or null. */
export function rowGroupOf(groups: readonly LayerRowGroup[], id: number | null): LayerRowGroup | null {
  if (id === null) return null;
  return groups.find((group) => group.members.some((row) => row.id === id)) ?? null;
}
