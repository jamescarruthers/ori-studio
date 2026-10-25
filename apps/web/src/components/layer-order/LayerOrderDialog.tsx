import { useMemo, useState } from 'react';
import type { LayerOrderDialogOpening } from '../../layer-order/dialog/layerOrderDialogStore';
import { requestFaceLetters } from '../../layer-order/dialog/layerOrderSession';
import { useLayerOrderSession } from '../../layer-order/dialog/useLayerOrderSession';
import { useLayerOrderSettle } from '../../layer-order/dialog/useLayerOrderSettle';
import { useModalFullScreen } from '../ui/ModalFrame';
import { LayerOrderDialogFrame, type LayerOrderPhonePane } from './LayerOrderDialogFrame';
import { LayerOrderPanesPlaceholder } from './LayerOrderPanesPlaceholder';

/**
 * The Layer order dialog: the entry of its lazy chunk, which only its gateway
 * imports (`layer-order/dialog/layerOrderDialogGateway.ts`) and the app
 * root's mount renders (`LayerOrderDialogMount`). A composition site, as a
 * panel is (AGENTS.md): the session and its engine worker
 * (`useLayerOrderSession`), the ways out (`useLayerOrderSettle`), and the
 * frame with its two regions. U8 puts its panes in the panes region, U10 its
 * inspector, tools and history in the frame.
 *
 * Mounted once per opening (keyed by its id), so every opening starts fresh
 * with a worker of its own, terminated as it closes.
 */
export function LayerOrderDialog({ opening }: { opening: LayerOrderDialogOpening }) {
  const { request } = opening;
  const session = useLayerOrderSession(request);
  const settle = useLayerOrderSettle(opening, session);
  const fullScreen = useModalFullScreen();
  const [pane, setPane] = useState<LayerOrderPhonePane>('folded');
  const phonePane = fullScreen ? pane : null;
  const { status } = session;
  const shownLetters = useMemo(() => requestFaceLetters(request), [request]);
  const letters = status.kind === 'ready' ? status.open.letters : shownLetters;

  return (
    <LayerOrderDialogFrame
      name={request.name}
      byline={request.byline}
      status={status}
      letters={letters}
      returnFocus={opening.returnFocus}
      phonePane={phonePane}
      onPhonePaneChange={setPane}
      panes={<LayerOrderPanesPlaceholder status={status} phonePane={phonePane} request={request} letters={letters} />}
      onRetry={() => session.reopen()}
      onCancel={settle.cancel}
      onApply={() => void settle.apply()}
      applying={settle.applying}
      applyRefusal={settle.applyRefusal}
    />
  );
}
