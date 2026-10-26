import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';
import {
  TURN_OVER_BOX,
  TURN_OVER_HEAD_PATH,
  TURN_OVER_PATH,
} from '../../lib/stepDiagram/stepDiagramGeometry';

const BOX = 20;
const SCALE = 17 / TURN_OVER_BOX.width;
const TRANSFORM = `translate(${(BOX - TURN_OVER_BOX.width * SCALE) / 2} ${(BOX - TURN_OVER_BOX.height * SCALE) / 2}) scale(${SCALE})`;

/** The diagram's looped turnover arrow, sized for a toolbar or menu. */
export const TurnOverIcon = forwardRef<SVGSVGElement, LucideProps>(function TurnOverIcon(
  { size = BOX, color = 'currentColor', strokeWidth = 1.5, absoluteStrokeWidth = false, ...props },
  ref
) {
  const width = Number(strokeWidth) * (absoluteStrokeWidth ? BOX / Number(size) : 1);
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox={`0 0 ${BOX} ${BOX}`}
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <g transform={TRANSFORM}>
        <path d={TURN_OVER_PATH} strokeWidth={width / SCALE} />
        <path d={TURN_OVER_HEAD_PATH} fill={color} stroke="none" />
      </g>
    </svg>
  );
});
