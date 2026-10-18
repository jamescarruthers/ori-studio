import { FlipHorizontal2, FlipVertical2, Trash2, type LucideIcon } from 'lucide-react';
import type { AnnotationAction, AnnotationActionId } from '../../diagram/annotate/annotationActions';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import styles from './DiagramAnnotationToolbar.module.css';

/** The verbs an icon says plainly; every other verb is its words (Zach, 2026-10-18). */
const ICONS: Readonly<Partial<Record<AnnotationActionId, LucideIcon>>> = {
  'flip-horizontal': FlipHorizontal2,
  'flip-vertical': FlipVertical2,
  delete: Trash2,
};

/**
 * The selected mark's verbs in Annotate's Layers inspector, in one toolbar
 * under its name (redesign, 2026-10-18) — only those the catalog offers it
 * (`annotationActions.ts`): its flips as icons; Flip Arc, Reset Shape and
 * Turn 90° in words, which no icon says (Flip Arc's borrowed Flip Vertical's
 * and was taken for it); and Delete last. A verb that refuses keeps its
 * place and its focus, and says why on hover (`keyed`).
 */
export function DiagramAnnotationToolbar({
  label,
  actions,
  keyed,
}: {
  /** The mark's name: what the toolbar acts on, for assistive technology. */
  label: string;
  /** The flip and annotation verbs; node verbs are Edit Path's, under the toolbar. */
  actions: readonly AnnotationAction[];
  /** A verb's tooltip: its name and its key. */
  keyed: (action: AnnotationAction) => string;
}) {
  const flips = actions.filter((action) => action.group === 'flip');
  const words = actions.filter((action) => action.group === 'annotation' && action.id !== 'delete');
  const remove = actions.find((action) => action.id === 'delete');
  const run = (action: AnnotationAction) => () => {
    if (!action.disabled) action.run();
  };
  const icon = (action: AnnotationAction) => {
    const Icon = ICONS[action.id]!;
    return (
      <IconButton
        key={action.id}
        size="sm"
        title={keyed(action)}
        aria-label={action.label}
        aria-disabled={action.disabled || undefined}
        onClick={run(action)}
      >
        <Icon size={15} aria-hidden="true" />
      </IconButton>
    );
  };
  return (
    <div className={styles.toolbar} role="toolbar" aria-label={label} data-annotation-toolbar="">
      {flips.map(icon)}
      {flips.length > 0 && words.length > 0 && <span className={styles.separator} aria-hidden="true" />}
      {words.map((action) => (
        <Button
          key={action.id}
          size="sm"
          variant="ghost"
          // Refusing keeps the focus: Reset Shape refuses once it has run.
          aria-disabled={action.disabled || undefined}
          title={keyed(action)}
          onClick={run(action)}
        >
          {action.label}
        </Button>
      ))}
      {remove && <span className={styles.end}>{icon(remove)}</span>}
    </div>
  );
}
