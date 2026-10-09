import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, PenLine } from 'lucide-react';
import type { FoldPaneDisplay } from '../../../fold/canvas/foldPaneScenes';
import { ViewportToolbar, type ViewportToolbarGroupSpec } from '../../panels/ViewportToolbar';

/**
 * The floating bar along the bottom of the Fold canvas (plan D14, the
 * design's): the shared zoom cluster and Fit, for both panes at once, the
 * panes' two display switches — the step's own creases drawn as its
 * instruction, and the precreases — the step's transport (`playback`), and a
 * slot for Send to Edit, which the panel supplies.
 *
 * A phone's bar leads with the canvas's own controls (`phoneControls`: the
 * tools and the pane switch), then the transport; the display switches and
 * Fit are in its `⋯` menu, the zoom left to a pinch.
 */
export function FoldViewportToolbar({
  zoomPercent,
  camera,
  display,
  onDisplay,
  playback,
  phoneControls,
  sendToEdit,
}: {
  zoomPercent: number;
  camera: {
    zoomIn: () => void;
    zoomOut: () => void;
    fit: () => void;
    setZoomPercent: (percent: number) => void;
  };
  display: FoldPaneDisplay;
  onDisplay: (display: FoldPaneDisplay) => void;
  /** The step's transport controls (`FoldPlaybackControls`). */
  playback?: ReactNode;
  /** A phone's: the tools and the pane switch (`FoldPhoneBarControls`), at the head of the bar. */
  phoneControls?: ReactNode;
  sendToEdit?: ReactNode;
}) {
  const { t } = useTranslation();
  const groups: ViewportToolbarGroupSpec[] = [
    { id: 'phone', items: [phoneControls ? { kind: 'node', id: 'fold-phone-controls', node: phoneControls } : null] },
    {
      id: 'display',
      items: [
        {
          kind: 'action',
          id: 'step-creases',
          label: t('panels:fold.canvas.stepCreases', 'Step creases'),
          title: t(
            'panels:fold.canvas.stepCreasesTitle',
            'Draw the creases the step on show made as its instruction, in the diagram pens'
          ),
          icon: <PenLine size={14} />,
          checked: display.stepCreases,
          pinned: true,
          // A phone's bar is the tools' and the transport's: this goes to its menu.
          onPhone: 'collapse',
          onSelect: () => onDisplay({ ...display, stepCreases: !display.stepCreases }),
        },
        {
          kind: 'action',
          id: 'precreases',
          label: t('panels:fold.canvas.precreases', 'Precreases'),
          title: t('panels:fold.canvas.precreasesTitle', 'Draw the flat creases: precreases, and folds undone'),
          icon: <Layers size={14} />,
          checked: display.precreases,
          pinned: true,
          onPhone: 'collapse',
          onSelect: () => onDisplay({ ...display, precreases: !display.precreases }),
        },
      ],
    },
    { id: 'playback', items: [playback ? { kind: 'node', id: 'fold-playback', node: playback } : null] },
    { id: 'send', items: [sendToEdit ? { kind: 'node', id: 'send-to-edit', node: sendToEdit } : null] },
  ];
  return (
    <ViewportToolbar
      ariaLabel={t('panels:fold.canvas.toolbar', 'Fold view')}
      zoomPercent={zoomPercent}
      zoomIn={camera.zoomIn}
      zoomOut={camera.zoomOut}
      fitToView={camera.fit}
      setZoomLevel={(scale) => camera.setZoomPercent(scale * 100)}
      groups={groups}
      // A phone's bar is the canvas's tools and the step's transport, with
      // the zoom buttons left to a pinch, and Fit and the display switches in
      // the overflow menu. Inline, they wrapped the bar onto a second row.
      phoneViewControls="collapsed"
    />
  );
}
