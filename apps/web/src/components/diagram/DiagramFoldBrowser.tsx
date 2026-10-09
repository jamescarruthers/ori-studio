import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { FoldVertical } from 'lucide-react';
import { selectable } from '../../diagram/references/referencesBrowserSelection';
import {
  APP_FOLD_PROVIDER,
  useFoldBrowser,
  type FoldBrowser,
  type FoldBrowserProvider,
} from '../../diagram/fold/useFoldBrowser';
import { useLayoutStore } from '../../store/layoutStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { DiagramFoldBrowserState } from '../../store/workspaceStore/types';
import { Button } from '../ui/Button';
import {
  PullBrowserFrame,
  PullBrowserGrid,
  PullBrowserMessage,
  usePullBrowserDialog,
  type PullBrowserList,
} from './DiagramReferencesBrowser';
import { DiagramPullCard, DiagramPullCardThumbnail } from './DiagramReferencesCard';
import { DiagramSheetThumbnail } from './DiagramSheetThumbnail';

/**
 * The Fold browser (fold-workspace plan D17): a modal over the Diagram, from
 * which a Fold sequence's steps are pulled — as References' cards are (D20),
 * in the same frame — or sent from Fold. Mounted at the App root while the
 * Diagram is the workspace on screen and the store says it is open.
 */
export function DiagramFoldModal() {
  const state = useWorkspaceStore((store) => store.diagramFoldBrowser);
  const shown = useLayoutStore((store) => store.activeWorkspace === 'diagram');
  if (!state || !shown) return null;
  return <DiagramFoldBrowser key={state.opening} state={state} />;
}

/**
 * The browser itself: the shown sequence's active path as cards — each step
 * that folds, the turns between them, and Finished — each the step it would
 * become, its sentence Fold's own; under them what is selected and the one
 * verb, worded by where the browser was opened for. `provider` is the app's
 * Fold session, or a fake one in a test.
 */
export function DiagramFoldBrowser({
  state,
  provider = APP_FOLD_PROVIDER,
}: {
  state: DiagramFoldBrowserState;
  provider?: FoldBrowserProvider;
}) {
  const { t } = useTranslation();
  const browser = useFoldBrowser(state, provider);
  const list: PullBrowserList = {
    selection: browser.selection,
    ready: browser.cards.status === 'ready',
    pullableCount: browser.pullable.length,
    pulling: browser.pulling,
    turnOverBefore: browser.turnOverBefore,
    withTurnOver: browser.withTurnOver,
    setWithTurnOver: browser.setWithTurnOver,
    move: browser.move,
    extend: browser.extend,
    toggle: browser.toggle,
    selectAll: browser.selectAll,
    clear: browser.clear,
    add: browser.add,
    close: browser.close,
  };
  const dialog = usePullBrowserDialog(list, state.anchor);
  return (
    <PullBrowserFrame
      dialog={dialog}
      list={list}
      title={browserTitle(browser, t)}
      addLabel={addLabel(browser, t)}
      tools={
        <Button size="sm" variant="ghost" onClick={browser.openFold}>
          <FoldVertical size={14} aria-hidden="true" />
          {t('panels:diagram.fold.openFold', 'Open Fold')}
        </Button>
      }
    >
      <FoldCards browser={browser} />
    </PullBrowserFrame>
  );
}

/** The sequence's cards, or why there are none. */
function FoldCards({ browser }: { browser: FoldBrowser }) {
  const { t } = useTranslation();
  const { cards } = browser;
  if (cards.status === 'empty') {
    return (
      <PullBrowserMessage
        text={t('panels:diagram.fold.empty', 'Fold a step in Fold, and the sequence’s steps appear here.')}
        action={{ label: t('panels:diagram.fold.openFold', 'Open Fold'), run: browser.openFold }}
      />
    );
  }
  const offered = browser.withTurnOver ? browser.turnOverBefore : null;
  // One Tab stop: where the keyboard is, or the first card that can be selected.
  const tabStop = browser.selection.focus ?? cards.cards.find((card) => card.step)?.index ?? null;
  return (
    <PullBrowserGrid label={t('panels:diagram.fold.steps', 'Steps')}>
      {cards.cards.map((card) => (
        <DiagramPullCard
          key={card.index}
          index={card.index}
          kind={card.kind}
          title={
            card.kind === 'fold'
              ? t('panels:diagram.fold.card', 'Step {{number}}', { number: card.number ?? '' })
              : card.kind === 'turn-over'
                ? t('panels:diagram.fold.turnCard', 'Turn')
                : t('panels:diagram.references.finished', 'Finished')
          }
          badge=""
          picture={
            card.picture ? (
              <DiagramPullCardThumbnail>
                <DiagramSheetThumbnail thumbnail={card.picture} />
              </DiagramPullCardThumbnail>
            ) : null
          }
          onPaper={false}
          unreadable={card.step === null}
          why={
            card.step === null
              ? t('panels:diagram.fold.notLanded', 'Fold hasn’t folded this step, so it can’t be added yet.')
              : undefined
          }
          sentence={card.sentence}
          ways={null}
          inDiagram={browser.inDiagram.get(card.index) ?? null}
          shownNow={false}
          selected={browser.selection.indices.has(card.index)}
          tabStop={card.index === tabStop}
          offered={offered === card.index}
          choosable={selectable(card, true)}
          onPress={(modifiers) => browser.press(card.index, modifiers)}
          onFocus={() => browser.focusOn(card.index)}
        />
      ))}
    </PullBrowserGrid>
  );
}

/** The browser's title: where what it adds goes. */
function browserTitle(browser: FoldBrowser, t: TFunction): string {
  const { anchor } = browser.state;
  const number = browser.anchorNumber;
  if (number === null || anchor.kind === 'end') return t('panels:diagram.fold.titleEnd', 'Add from Fold');
  if (anchor.kind === 'fill' && browser.anchorTakesFirst) {
    return t('panels:diagram.references.titleFill', 'Fill step {{number}}', { number });
  }
  return t('panels:diagram.references.titleAfter', 'Add after step {{number}}', { number });
}

/** The verb, as what it will do: how many steps, and where. A turn is no step (D22). */
function addLabel(browser: FoldBrowser, t: TFunction): string {
  const steps = browser.pullable.filter((target) => target.kind === 'step').length;
  const count = Math.max(1, steps);
  const { anchor } = browser.state;
  const number = browser.anchorNumber;
  if (number === null || anchor.kind === 'end') {
    return t('panels:diagram.references.addSteps', {
      count,
      defaultValue_one: 'Add step',
      defaultValue_other: 'Add {{count}} steps',
    });
  }
  if (anchor.kind === 'fill' && browser.anchorTakesFirst) {
    const rest = count - 1;
    return rest === 0
      ? t('panels:diagram.references.fill', 'Fill step {{number}}', { number })
      : t('panels:diagram.references.fillAndAdd', {
          count: rest,
          number,
          defaultValue_one: 'Fill step {{number}} and add 1 after it',
          defaultValue_other: 'Fill step {{number}} and add {{count}} after it',
        });
  }
  return t('panels:diagram.references.addAfter', {
    count,
    number,
    defaultValue_one: 'Add step after step {{number}}',
    defaultValue_other: 'Add {{count}} steps after step {{number}}',
  });
}
