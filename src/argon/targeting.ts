// Argon asks for the targets of an item with its target picker: it waits until enough tokens got targeted with the
// mouse. This lets a gamepad move a cursor from token to token and target them.

import type { Point } from "../core/axes";
import { nearest, nextInDirection, type Rect } from "../core/spatial";

const PICKER_SELECTOR = ".ech-target-picker";
// how far a fully pushed stick moves the map, in screen pixels per second
const PAN_SPEED = 1100;
// how much a held button zooms per second
const ZOOM_SPEED = 1.2;
const DEAD_ZONE = 0.2;
// a token this close to the edge of the screen is brought into view
const VIEW_MARGIN = 60;

/** argon waits for targets right now. */
export function isTargetPickerActive(): boolean {
  return !!document.querySelector(PICKER_SELECTOR);
}

/**
 * The target picker of argon gives up on a right click.
 */
export function abortTargetPicker() {
  const event = new MouseEvent("mouseup", { bubbles: true, button: 2 });
  if (event.which !== 3) {
    Object.defineProperty(event, "which", { value: 3 });
  }
  document.dispatchEvent(event);
}

/**
 * Tells the target picker of argon that the tokens targeted so far are all there is to target: the minus key lowers
 * the amount of targets it waits for. Nothing happens as long as no token is targeted.
 */
export function finishTargetPicker() {
  // no item has more targets than this
  for (let i = 0; i < 20 && isTargetPickerActive(); i++) {
    document.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "-" }));
  }
}

/**
 * A cursor that jumps from token to token.
 */
export class TargetCursor {
  private tokenId?: string;
  private marker?: any;
  private label?: any;

  /**
   * Call this on every tick while targets are picked: keeps the cursor on its token and puts it on the token next to
   * `origin` when it has none yet.
   */
  sync(origin: any | undefined, color: number) {
    const tokens = this.candidates();
    let token = tokens.find((candidate) => candidate.id === this.tokenId);
    if (!token) {
      // Most of the time an enemy is the target, then somebody else. The own token is the last choice.
      const others = tokens.filter((candidate) => candidate !== origin);
      const enemies = others.filter((candidate) => isHostile(origin, candidate));
      const pool = enemies.length ? enemies : others.length ? others : tokens;
      const center: Point = origin?.center ?? canvas.dimensions.rect.center;
      token = pool[nearest(pool.map(boundsOf), center)];
    }
    this.place(token, color, origin);
  }

  move(direction: Point, color: number, origin?: any) {
    const tokens = this.candidates();
    const current = tokens.findIndex((candidate) => candidate.id === this.tokenId);
    const next = tokens[nextInDirection(tokens.map(boundsOf), current, direction)];
    if (!next) return;
    this.place(next, color, origin);
    bringIntoView(next);
  }

  /** targets the token below the cursor, or releases it when it is a target already. */
  toggle() {
    const token = this.candidates().find((candidate) => candidate.id === this.tokenId);
    token?.setTarget(!game.user.targets.has(token), { releaseOthers: false });
  }

  clear() {
    this.tokenId = undefined;
    if (this.marker && !this.marker.destroyed) {
      this.marker.destroy({ children: true });
    }
    this.marker = undefined;
    this.label = undefined;
  }

  private candidates(): any[] {
    if (!canvas?.ready) return [];
    return canvas.tokens.placeables.filter((token: any) => token.visible);
  }

  private place(token: any | undefined, color: number, origin?: any) {
    if (!token) {
      this.clear();
      return;
    }
    this.tokenId = token.id;
    if (!this.marker || this.marker.destroyed) {
      this.marker = new PIXI.Graphics();
      this.label = new PIXI.Text("", labelStyle());
      this.label.anchor.set(0.5, 0);
      this.marker.addChild(this.label);
      (canvas.interface ?? canvas.stage).addChild(this.marker);
    }
    const radius = Math.max(token.w, token.h) / 2 + canvas.grid.size * 0.12;
    const width = Math.max(4, canvas.grid.size * 0.06);
    this.marker.clear();
    this.marker.lineStyle(width + 4, 0x000000, 0.6).drawCircle(0, 0, radius);
    this.marker.lineStyle(width, color, 1).drawCircle(0, 0, radius);
    this.marker.position.set(token.center.x, token.center.y);
    // how far away the token is, to compare with the range of what is used
    this.label.text = origin && origin !== token ? distanceTo(origin, token) : "";
    this.label.position.set(0, radius + width);
  }
}

function isHostile(origin: any | undefined, token: any): boolean {
  // friendly is 1, hostile -1, neutral 0
  return (origin?.document?.disposition ?? 0) * (token.document?.disposition ?? 0) < 0;
}

function distanceTo(origin: any, token: any): string {
  try {
    const { distance } = canvas.grid.measurePath([origin.center, token.center]);
    return `${Math.round(distance * 10) / 10} ${canvas.scene.grid.units ?? ""}`.trim();
  } catch (e) {
    return "";
  }
}

function labelStyle(): any {
  const style = CONFIG.canvasTextStyle?.clone?.() ?? {};
  style.fontSize = Math.max(24, canvas.grid.size * 0.3);
  return style;
}

function boundsOf(token: any): Rect {
  const { x, y, width, height } = token.bounds;
  return { x, y, width, height };
}

/** pans the map to a token that is not on the screen. */
function bringIntoView(token: any) {
  const point = canvas.stage.worldTransform.apply(token.center);
  const inView =
    point.x > VIEW_MARGIN &&
    point.y > VIEW_MARGIN &&
    point.x < window.innerWidth - VIEW_MARGIN &&
    point.y < window.innerHeight - VIEW_MARGIN;
  if (!inView) {
    canvas.animatePan({ x: token.center.x, y: token.center.y, duration: 250 });
  }
}

export interface ViewInput {
  // where the map moves to, each axis from -1 to 1
  pan: Point;
  // 1 zooms in, -1 zooms out
  zoom: number;
}

/**
 * Pans and zooms the map with a gamepad. A tick comes every 100ms only, so this reads the gamepad on every frame.
 */
export class ViewControl {
  private frame?: number;
  private last = 0;
  private gamepadIndex = -1;
  private read?: (gamepad: Gamepad) => ViewInput;

  get running(): boolean {
    return this.frame !== undefined;
  }

  /**
   * @param read what the sticks and buttons of the gamepad ask for at this moment.
   */
  start(gamepadIndex: number, read: (gamepad: Gamepad) => ViewInput) {
    this.gamepadIndex = gamepadIndex;
    this.read = read;
    if (this.frame === undefined) {
      this.last = performance.now();
      this.frame = requestAnimationFrame((now) => this.step(now));
    }
  }

  stop() {
    if (this.frame !== undefined) {
      cancelAnimationFrame(this.frame);
      this.frame = undefined;
    }
  }

  private step(now: number) {
    this.frame = requestAnimationFrame((next) => this.step(next));
    // a tab in the background gets no frames, do not jump when it comes back
    const seconds = Math.min(now - this.last, 100) / 1000;
    this.last = now;
    const gamepad = navigator.getGamepads()[this.gamepadIndex];
    if (!gamepad || !this.read || !canvas?.ready) return;
    const { pan, zoom } = this.read(gamepad);
    const x = Math.abs(pan.x) > DEAD_ZONE ? pan.x : 0;
    const y = Math.abs(pan.y) > DEAD_ZONE ? pan.y : 0;
    if (x === 0 && y === 0 && zoom === 0) return;
    const scale = canvas.stage.scale.x;
    canvas.pan({
      x: canvas.stage.pivot.x + (x * PAN_SPEED * seconds) / scale,
      y: canvas.stage.pivot.y + (y * PAN_SPEED * seconds) / scale,
      scale: scale * (1 + zoom * ZOOM_SPEED * seconds),
    });
  }
}
