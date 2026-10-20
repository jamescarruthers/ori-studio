import { useTranslation } from 'react-i18next';
import { trackFoldPaperStyleChanged, trackFoldSheetChanged } from '../../analytics/trackFold';
import { SQUARE_PAPER } from '../../fold/document/foldSequenceDocument';
import { documentShapeOf, paneShapeOf } from '../../fold/sequence/foldPaperShapes';
import { useFoldStoredPaperStyle } from '../../fold/sequence/useFoldPaperStyle';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { isShownFoldSequenceReadOnly, shownFoldSequence } from '../../store/workspaceStore/foldState';
import { FoldPaperPane } from '../fold/FoldPaperPane';
import styles from './FoldPaperPanel.module.css';

/** The sheet of the shown sequence, or the square its first edit makes. */
const selectPaper = (state: Parameters<typeof shownFoldSequence>[0]) => shownFoldSequence(state)?.document.paper ?? SQUARE_PAPER;
const selectStepCount = (state: Parameters<typeof shownFoldSequence>[0]) =>
  shownFoldSequence(state)?.document.steps.length ?? 0;

/**
 * Fold's Paper pane: the paper style the shown sequence is drawn in, and the
 * sheet it starts from (`implementation-plans/fold-workspace.md`, D7, D11,
 * D14).
 *
 * A composition site: the rows are `FoldPaperPane`'s, the style and the sheet
 * the shown sequence's in the store, the sheet translated between the
 * document's shapes and the tab's (`foldPaperShapes`). A new style, shape or
 * side is one undo step each; a new shape empties the steps, which the tab
 * says beforehand.
 */
export function FoldPaperPanel() {
  const { t } = useTranslation();
  const paper = useWorkspaceStore(selectPaper);
  const style = useFoldStoredPaperStyle();
  const stepCount = useWorkspaceStore(selectStepCount);
  const readOnly = useWorkspaceStore(isShownFoldSequenceReadOnly);
  const setStyle = useWorkspaceStore((state) => state.setFoldPaperStyle);
  const setShape = useWorkspaceStore((state) => state.setFoldPaperShape);
  const setStartSide = useWorkspaceStore((state) => state.setFoldStartSide);
  return (
    <section className="panel-shell" aria-label={t('panels:sidePane.paper', 'Paper')}>
      <div className={`panel-body ${styles.body}`}>
        <FoldPaperPane
          style={style}
          onStyleChange={(choice) => {
            if (setStyle(choice.style)) trackFoldPaperStyleChanged(choice.analytics);
          }}
          shape={paneShapeOf(paper.shape)}
          startSide={paper.startSide}
          stepCount={stepCount}
          readOnly={readOnly}
          onShapeChange={(shape) => {
            const stored = documentShapeOf(shape);
            if (stored && setShape(stored)) trackFoldSheetChanged('shape', { shape: stored.kind, startSide: paper.startSide });
          }}
          onStartSideChange={(side) => {
            if (setStartSide(side)) trackFoldSheetChanged('start_side', { shape: paper.shape.kind, startSide: side });
          }}
        />
      </div>
    </section>
  );
}
