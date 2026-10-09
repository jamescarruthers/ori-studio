import type { ReactElement, ReactNode } from 'react';
import {
  ArrowDownToDot,
  ArrowDownToLine,
  ArrowUpFromLine,
  BetweenHorizontalStart,
  ChevronsDownUp,
  Divide,
  FlipHorizontal2,
  Flower2,
  IterationCw,
  Rabbit,
  Redo2,
  RotateCw,
  Shrink,
  type LucideIcon,
} from 'lucide-react';
import type { FoldLineModeId, FoldPlannedOpId, FoldRailItemId } from '../../fold/tools/foldToolCatalog';
import { FoldKindMark } from './FoldKindMark';

const SIZE = 20;

/** The dash a glyph draws a fold line in: the line the tool locates. */
const FOLD_DASH = '2.4 2.2';

/** One stroke in the rail's ink, for a glyph drawn here. */
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** A reference point: filled. */
const Dot = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={1.6} fill="currentColor" stroke="none" />;
/** A point the fold passes through but does not move: open. */
const Ring = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={1.9} />;
/** The fold line the mode locates. */
const FoldLine = ({ d }: { d: string }) => <path d={d} strokeDasharray={FOLD_DASH} />;

/**
 * Each line mode's picture: the references it takes — points filled, a pivot
 * open, edges solid — and the fold line it finds, dashed.
 */
function lineModeGlyph(mode: FoldLineModeId): ReactElement {
  switch (mode) {
    case 'axiom-1':
      return (
        <Glyph>
          <FoldLine d="M3 17 17 3" />
          <Dot x={6.5} y={13.5} />
          <Dot x={13.5} y={6.5} />
        </Glyph>
      );
    case 'axiom-2':
      return (
        <Glyph>
          <FoldLine d="M10 2v16" />
          <Dot x={4} y={14} />
          <Dot x={16} y={14} />
          <path d="M5 10Q10 4 15 10M12.9 9.6 15 10l.3-2.2" />
        </Glyph>
      );
    case 'axiom-3':
      return (
        <Glyph>
          <path d="M2 17h16M2 17 14 5" />
          <FoldLine d="M2 17 18 10.4" />
        </Glyph>
      );
    case 'axiom-4':
      return (
        <Glyph>
          <path d="M2 14h16" />
          <FoldLine d="M10 2v16" />
          <Dot x={10} y={7} />
        </Glyph>
      );
    case 'axiom-5':
      return (
        <Glyph>
          <path d="M2 17h16" />
          <Dot x={5} y={6} />
          <Ring x={14} y={5} />
          <FoldLine d="M13.2 6.8 8 18" />
        </Glyph>
      );
    case 'axiom-6':
      return (
        <Glyph>
          <path d="M2 17h16M3 2v15" />
          <Dot x={8} y={7} />
          <Dot x={14} y={11} />
          <FoldLine d="M6 18 18 4" />
        </Glyph>
      );
    case 'axiom-7':
      return (
        <Glyph>
          <path d="M2 17h12M17 2v16" />
          <Dot x={7} y={7} />
          <FoldLine d="M2 12h13" />
        </Glyph>
      );
    case 'free':
      return (
        <Glyph>
          <FoldLine d="M5.4 13.6 14.6 6.4" />
          <Ring x={4} y={15} />
          <Ring x={16} y={5} />
        </Glyph>
      );
    case 'crease':
      // A crease already there, solid, with the fold swinging over it.
      return (
        <Glyph>
          <path d="M3 17 17 3" />
          <path d="M5 8Q8 4 12 5M10.2 3.9 12 5l-1.1 1.8" />
        </Glyph>
      );
  }
}

const PLANNED_ICONS: Readonly<Record<FoldPlannedOpId, LucideIcon>> = {
  'outside-reverse': Redo2,
  crimp: ChevronsDownUp,
  tuck: BetweenHorizontalStart,
  squash: Shrink,
  petal: Flower2,
  'rabbit-ear': Rabbit,
  swivel: IterationCw,
  'open-sink': ArrowDownToLine,
  'closed-sink': ArrowDownToDot,
  unsink: ArrowUpFromLine,
};

/**
 * Every Fold rail item's icon: a fold's letter in its crease's ink; a line
 * mode's picture of what it locates; the app's own icons for the Divide line,
 * the model verbs and the folds still to come.
 */
export function FoldToolGlyph({ id }: { id: FoldRailItemId }): ReactElement {
  switch (id) {
    case 'valley':
    case 'mountain':
    case 'precrease':
    case 'inside-reverse':
      return <FoldKindMark kind={id} />;
    case 'divide-line':
      return <Divide size={SIZE} strokeWidth={1.5} aria-hidden="true" />;
    case 'turn-over':
      return <FlipHorizontal2 size={SIZE} strokeWidth={1.5} aria-hidden="true" />;
    case 'rotate':
      return <RotateCw size={SIZE} strokeWidth={1.5} aria-hidden="true" />;
    case 'axiom-1':
    case 'axiom-2':
    case 'axiom-3':
    case 'axiom-4':
    case 'axiom-5':
    case 'axiom-6':
    case 'axiom-7':
    case 'free':
    case 'crease':
      return lineModeGlyph(id);
    default: {
      const Icon = PLANNED_ICONS[id];
      return <Icon size={SIZE} strokeWidth={1.5} aria-hidden="true" />;
    }
  }
}
