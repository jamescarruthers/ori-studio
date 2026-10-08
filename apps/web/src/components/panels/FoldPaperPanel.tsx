import { useTranslation } from 'react-i18next';

/**
 * Fold's Paper pane: the app's display style for the sheet being folded, its
 * front and back colours and its pens (`implementation-plans/fold-workspace.md`,
 * D11, D14).
 *
 * Registered ahead of its rows, so the dock, the touch drawer and a restored
 * layout already know the pane; the rows land with the Fold panel.
 */
export function FoldPaperPanel() {
  const { t } = useTranslation();
  return (
    <section className="panel-shell" aria-label={t('panels:sidePane.paper', 'Paper')}>
      <div className="panel-body" />
    </section>
  );
}
