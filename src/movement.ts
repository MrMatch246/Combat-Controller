// Walks the token while the stick is held.

import type { Point } from "./core/axes";
import { TOKEN_SPEED, setting } from "./definitions";
import { noteGlide, noteStep } from "./tokens";

// The stick counts as released when the controller did not report it for this long, it reports every 100ms.
const HOLD_TIMEOUT = 250;
// The next step is sent when the token on the screen is this close (in grid steps) to where the current step ends,
// in a free walk when half of the piece is left.
// Foundry chains the animations, so the token keeps walking without a halt between two steps, and it never has more
// than this one step ahead of it when the stick changes direction or is released.
const LOOKAHEAD = 0.25;
// Never wait longer than this for the animation of a step.
const STEP_TIMEOUT = 2000;
// How often a token that stands in front of a wall tries again while the stick is held.
const BLOCKED_RETRY = 100;
// A free walk is sent to foundry piece by piece. A fully pushed stick asks for pieces of this many grid spaces, so
// there are about 8 of them per second with the default speed.
const PIECE = 0.5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Moves a token one grid step into a direction, unless a wall is in the way or the game is paused.
 * @returns true when it moved.
 */
export async function stepToken(token: any, direction: Point): Promise<boolean> {
  if (game.paused && !game.user.isGM) return false;
  const size = canvas.grid.size;
  // the position the token is heading to, not the one its animation currently shows.
  const source = token.document._source;
  const from = { x: source.x, y: source.y };
  const destination = {
    x: Math.round(from.x / size) * size + direction.x * size,
    y: Math.round(from.y / size) * size + direction.y * size,
  };
  const center = token.getCenterPoint(destination);
  if (!canvas.dimensions.rect.contains(center.x, center.y) || token.checkCollision(center)) return false;
  // grid spaces per second, foundry itself moves a token with 6
  const movementSpeed = Number(setting(TOKEN_SPEED)) || undefined;
  await token.document.update(destination, { animation: { movementSpeed } });
  noteStep(token, from);
  return true;
}

/**
 * Moves a token a short piece into the direction of the stick, not from grid space to grid space. In front of a wall
 * it slides along it.
 * @param stick where the stick points to, the further it is pushed the faster the token walks.
 * @param starts this is the first piece of a walk.
 * @returns how far it moved in pixels, 0 when it could not move.
 */
export async function glideToken(token: any, stick: Point, starts: boolean): Promise<number> {
  if (game.paused && !game.user.isGM) return 0;
  const pushed = Math.min(Math.hypot(stick.x, stick.y), 1);
  if (pushed === 0) return 0;
  const source = token.document._source;
  const from = { x: source.x, y: source.y };
  const length = canvas.grid.size * PIECE * pushed;
  const dx = (stick.x / Math.hypot(stick.x, stick.y)) * length;
  const dy = (stick.y / Math.hypot(stick.x, stick.y)) * length;
  for (const [x, y] of [
    [dx, dy],
    [dx, 0],
    [0, dy],
  ]) {
    const destination = { x: Math.round(from.x + x), y: Math.round(from.y + y) };
    if (destination.x === from.x && destination.y === from.y) continue;
    const center = token.getCenterPoint(destination);
    if (!canvas.dimensions.rect.contains(center.x, center.y) || token.checkCollision(center)) continue;
    const movementSpeed = (Number(setting(TOKEN_SPEED)) || 6) * pushed;
    await token.document.update(destination, { animation: { movementSpeed } });
    noteGlide(token, from, starts);
    return Math.hypot(destination.x - from.x, destination.y - from.y);
  }
  return 0;
}

export class Walker {
  private walking = false;
  // what is walked with, where the stick points to and when that was reported last
  private held?: { token: any; at: number; read: () => Point | undefined; free: boolean };

  /**
   * Call this on every tick while the stick is pushed.
   * @param read where the stick points to at this very moment, undefined when it is released. The ticks only come
   * every 100ms, a turn or a release of the stick would be noticed too late to stop the next step.
   * @param free the token follows the stick freely instead of walking from grid space to grid space.
   */
  hold(token: any, read: () => Point | undefined, free = false) {
    this.held = { token, at: Date.now(), read, free };
    this.walk().catch(console.error);
  }

  release() {
    this.held = undefined;
  }

  /**
   * The walking is paced by the movement animation of the token and not by the ticks, otherwise the token halts
   * after each step until the next tick comes.
   */
  private async walk() {
    if (this.walking) return;
    this.walking = true;
    try {
      let starts = true;
      for (;;) {
        const held = this.held;
        if (!held || Date.now() - held.at >= HOLD_TIMEOUT) return;
        const direction = held.read();
        if (!direction) return;
        const moved = held.free
          ? (await glideToken(held.token, direction, starts)) / 2
          : (await stepToken(held.token, direction))
            ? canvas.grid.size * LOOKAHEAD
            : 0;
        if (moved) {
          starts = false;
          await almostArrived(held.token, moved);
        } else {
          await sleep(BLOCKED_RETRY);
        }
      }
    } finally {
      this.walking = false;
    }
  }
}

/**
 * resolves when the token on the screen is within this many pixels of the position its document is heading to.
 * Watches the token itself instead of calculating the duration: systems and modules change the movement speed.
 */
async function almostArrived(token: any, within: number) {
  const start = Date.now();
  while (Date.now() - start < STEP_TIMEOUT && !token.destroyed) {
    const source = token.document._source;
    const distance = Math.hypot(source.x - token.position.x, source.y - token.position.y);
    if (distance <= within) return;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}
