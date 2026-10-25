import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from './IconButton';
import styles from './Pager.module.css';

/**
 * One of a pager's two verbs: back to the one before, or on to the next.
 *
 * `disabled` refuses rather than disables (`aria-disabled`): the button keeps
 * the focus a press gave it while what it started runs, or at either end, and
 * its `run` is expected to do nothing then. `hint` says why, in place of the
 * label, while it is refused.
 */
export interface PagerVerb {
  label: string;
  disabled: boolean;
  hint?: string;
  run: () => void;
}

/**
 * ‹ where it stands ›: a value stepped through one at a time — a flat fold's
 * layer orders in the Diagram's Step pane and in Edit's Properties pane.
 * Either verb may be absent, which leaves its place empty.
 */
export function Pager({
  previous,
  next,
  children,
}: {
  previous?: PagerVerb;
  next?: PagerVerb;
  /** Where it stands, between the two: "2 of 5+". */
  children: ReactNode;
}) {
  return (
    <span className={styles.pager}>
      {previous && <PagerButton verb={previous} icon={<ChevronLeft size={14} />} />}
      <span className={styles.label}>{children}</span>
      {next && <PagerButton verb={next} icon={<ChevronRight size={14} />} />}
    </span>
  );
}

function PagerButton({ verb, icon }: { verb: PagerVerb; icon: ReactNode }) {
  return (
    <IconButton
      size="sm"
      aria-label={verb.label}
      title={verb.disabled && verb.hint ? verb.hint : verb.label}
      aria-disabled={verb.disabled || undefined}
      onClick={verb.run}
    >
      {icon}
    </IconButton>
  );
}
