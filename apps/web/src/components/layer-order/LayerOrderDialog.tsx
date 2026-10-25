import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LayerOrderDialogOpening } from '../../layer-order/dialog/layerOrderDialogStore';
import { requestFaceLetters } from '../../layer-order/dialog/layerOrderSession';
import { useLayerOrderPanesCheck } from '../../layer-order/dialog/useLayerOrderPanesCheck';
import { useLayerOrderSession } from '../../layer-order/dialog/useLayerOrderSession';
import { useLayerOrderSettle } from '../../layer-order/dialog/useLayerOrderSettle';
import type { LayerPanesView } from '../../layer-order/panes/layerPaneMarks';
import { layerOrderOpeningView } from '../../layer-order/panes/useLayerOrderPanes';
import { useModalFullScreen } from '../ui/ModalFrame';
import { LayerOrderDialogFrame, type LayerOrderPhonePane } from './LayerOrderDialogFrame';
import { applyWaitText } from './layerOrderNotices';
import { LayerOrderPanes } from './LayerOrderPanes';
import { LayerOrderViewTools } from './LayerOrderViewTools';

/**
 * The Layer order dialog: the entry of its lazy chunk, which only its gateway
 * imports (`layer-order/dialog/layerOrderDialogGateway.ts`) and the app
 * root's mount renders (`LayerOrderDialogMount`). A composition site, as a
 * panel is (AGENTS.md): the session and its engine worker
 * (`useLayerOrderSession`), the ways out (`useLayerOrderSettle`), and the
 * frame with its two regions: the panes (U8) and, from U10, the inspector
 * and its history.
 *
 * Until the inspector drives them (U10, from its model), the view tools set
 * the panes' view here, and nothing is marked on them but what a
 * development build's browser check shows (`useLayerOrderPanesCheck`).
 *
 * Mounted once per opening (keyed by its id), so every opening starts fresh
 * with a worker of its own, terminated as it closes.
 */
export function LayerOrderDialog({ opening }: { opening: LayerOrderDialogOpening }) {
  const { t } = useTranslation();
  const { request } = opening;
  const session = useLayerOrderSession(request);
  const settle = useLayerOrderSettle(opening, session);
  const fullScreen = useModalFullScreen();
  const [pane, setPane] = useState<LayerOrderPhonePane>('folded');
  const phonePane = fullScreen ? pane : null;
  const { status } = session;
  const shownLetters = useMemo(() => requestFaceLetters(request), [request]);
  const letters = status.kind === 'ready' ? status.open.letters : shownLetters;
  const [view, setView] = useState<LayerPanesView>(() => layerOrderOpeningView(request));
  const check = useLayerOrderPanesCheck(status);

  return (
    <LayerOrderDialogFrame
      name={request.name}
      byline={request.byline}
      status={status}
      letters={letters}
      returnFocus={opening.returnFocus}
      phonePane={phonePane}
      onPhonePaneChange={setPane}
      tools={<LayerOrderViewTools view={view} onChange={setView} disabled={status.kind !== 'ready'} />}
      panes={
        <LayerOrderPanes
          status={status}
          phonePane={phonePane}
          request={request}
          letters={letters}
          view={view}
          marks={check?.marks}
          stacks={check?.stacks}
        />
      }
      onRetry={() => session.reopen()}
      onCancel={settle.cancel}
      onApply={() => void settle.apply()}
      applyWaits={settle.waits && applyWaitText(t, settle.waits)}
      applying={settle.applying}
      applyRefusal={settle.applyRefusal}
    />
  );
}
