import { useTranslation } from 'react-i18next';

/**
 * Fold's Step pane: what the step on show does — its kind, its layers, its
 * crease-pattern diff and its sentence (`implementation-plans/fold-workspace.md`,
 * D14).
 *
 * Registered ahead of its rows, so the dock, the touch drawer and a restored
 * layout already know the pane; the rows land with the Fold panel.
 */
export function FoldStepPanel() {
  const { t } = useTranslation();
  return (
    <section className="panel-shell" aria-label={t('panels:sidePane.step', 'Step')}>
      <div className="panel-body" />
    </section>
  );
}
