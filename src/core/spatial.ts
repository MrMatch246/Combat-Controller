// Pure helpers to move a focus across things that are laid out on a screen, no Foundry access.

import type { Point } from "./axes";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// how much more a step to the side costs than a step into the direction that was asked for
const SIDE_WEIGHT = 3;
const EPSILON = 0.5;

/**
 * The one direction a stick or d-pad points to: left, right, up or down. A stick is never pushed exactly straight,
 * the stronger axis wins. Undefined while the stick rests.
 */
export function dominantDirection(point: Point, threshold = 0.5): Point | undefined {
  const x = Math.abs(point.x);
  const y = Math.abs(point.y);
  if (Math.max(x, y) < threshold) return undefined;
  return x >= y ? { x: Math.sign(point.x), y: 0 } : { x: 0, y: Math.sign(point.y) };
}

/**
 * Index of the rect the focus moves to when it leaves `current` into `direction`, -1 when there is nothing.
 * Prefers what lies straight ahead: a rect in the same row or column beats a closer one that sits diagonal.
 * @param direction one of left, right, up, down as given by dominantDirection, y grows downwards.
 * @param straight only what lies straight ahead counts: in the same row for left and right, in the same column for
 * up and down.
 */
export function nextInDirection(
  rects: readonly Rect[],
  current: number,
  direction: Point,
  straight: boolean = false,
): number {
  const from = rects[current];
  if (!from || (direction.x === 0 && direction.y === 0)) return -1;
  const horizontal = direction.x !== 0;
  const sign = horizontal ? direction.x : direction.y;
  // each rect as a span along the direction and a span across it
  const spans = (rect: Rect) => {
    const along = horizontal ? [rect.x, rect.x + rect.width] : [rect.y, rect.y + rect.height];
    const across = horizontal ? [rect.y, rect.y + rect.height] : [rect.x, rect.x + rect.width];
    return { along, across, alongCenter: (along[0] + along[1]) / 2, acrossCenter: (across[0] + across[1]) / 2 };
  };
  const source = spans(from);
  const sourceFar = sign > 0 ? source.along[1] : source.along[0];

  let best = -1;
  let bestScore: number[] | undefined;
  // first only what starts beyond the middle of the current rect, then everything that is ahead at all
  for (const strict of [true, false]) {
    rects.forEach((rect, index) => {
      if (index === current) return;
      const target = spans(rect);
      const ahead = (target.alongCenter - source.alongCenter) * sign;
      if (ahead <= EPSILON) return;
      const near = sign > 0 ? target.along[0] : target.along[1];
      if (strict && (near - source.alongCenter) * sign < -EPSILON) return;
      const forward = Math.max(0, (near - sourceFar) * sign);
      const side = Math.max(0, target.across[0] - source.across[1], source.across[0] - target.across[1]);
      // rows that only touch each other are not the same row
      const overlap = Math.min(target.across[1], source.across[1]) - Math.max(target.across[0], source.across[0]);
      if (straight && overlap <= EPSILON) return;
      const score = [forward + SIDE_WEIGHT * side, Math.abs(target.acrossCenter - source.acrossCenter), ahead];
      if (!bestScore || compare(score, bestScore) < 0) {
        best = index;
        bestScore = score;
      }
    });
    if (best >= 0) break;
  }
  return best;
}

/** Index of the rect whose center is closest to the point, -1 for an empty list. */
export function nearest(rects: readonly Rect[], point: Point): number {
  let best = -1;
  let bestDistance = Infinity;
  rects.forEach((rect, index) => {
    const distance = Math.hypot(rect.x + rect.width / 2 - point.x, rect.y + rect.height / 2 - point.y);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > EPSILON) return a[i] - b[i];
  }
  return 0;
}
