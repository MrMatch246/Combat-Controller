// Plans a movement before the token walks it, like dragging a token with the mouse while shift is held: the token
// can go anywhere, not only from grid space to grid space, and it walks there in a straight line. Foundry shows its
// ruler from the token to where it would go, with the distance and what it costs. Useful in a fight, where every
// foot counts.

import type { Point } from "./core/axes";
import { TOKEN_SPEED, setting } from "./definitions";
import { bringIntoView, noteStep } from "./tokens";

// how far a fully pushed stick moves the destination, in screen pixels per second
const SPEED = 520;
const DEAD_ZONE = 0.15;
// how often the map may follow a destination that leaves the screen
const FOLLOW_INTERVAL = 350;

/**
 * A destination for a token that it did not walk to yet.
 */
export class MovementPlan {
  private token?: any;
  private origin?: any;
  // where the token would go: its top left corner, like the position of a token
  private destination?: Point;
  private frame?: number;
  private last = 0;
  private followedAt = 0;
  private gamepadIndex = -1;
  private read?: (gamepad: Gamepad) => Point;
  // drawn by this module when the ruler of foundry can not be used
  private fallback?: any;

  /** a movement is being planned. */
  get active(): boolean {
    return !!this.token;
  }

  /** the token the movement is for. */
  get subject(): any | undefined {
    return this.token;
  }

  start(token: any) {
    this.cancel();
    const source = token.document._source;
    // what foundry itself copies from a token to describe where it is
    const fields: string[] = token.document.constructor.MOVEMENT_FIELDS ?? [
      "x",
      "y",
      "elevation",
      "width",
      "height",
      "depth",
      "shape",
      "level",
    ];
    const origin: any = { action: token.document.movementAction, snapped: false, explicit: true, checkpoint: true };
    for (const field of fields) origin[field] = source[field];
    this.token = token;
    this.origin = origin;
    this.destination = { x: origin.x, y: origin.y };
  }

  /**
   * Call this on every tick while the movement is planned: the stick moves the destination. A tick comes every 100ms
   * only, so the stick is read on every frame.
   * @param read where the stick points to at this moment, each axis from -1 to 1.
   */
  drive(gamepadIndex: number, read: (gamepad: Gamepad) => Point) {
    this.gamepadIndex = gamepadIndex;
    this.read = read;
    if (this.frame === undefined && this.token) {
      this.last = performance.now();
      this.frame = requestAnimationFrame((now) => this.step(now));
    }
  }

  /** moves the destination a tiny bit, a tenth of a grid space. */
  nudge(direction: Point) {
    const step = canvas.grid.size / 10;
    this.moveBy(direction.x * step, direction.y * step);
  }

  /**
   * Walks to the destination in a straight line.
   * @returns false when there was nowhere to walk to.
   */
  async confirm(): Promise<boolean> {
    const token = this.token;
    const origin = this.origin;
    const destination = this.waypoint();
    this.cancel();
    if (!token || !destination || (destination.x === origin.x && destination.y === origin.y)) return false;
    // grid spaces per second, foundry itself moves a token with 6
    const movementSpeed = Number(setting(TOKEN_SPEED)) || undefined;
    await token.document.move([destination], { method: "dragging", animation: { movementSpeed } });
    noteStep(token, origin);
    return true;
  }

  cancel() {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    const token = this.token;
    this.token = undefined;
    this.origin = undefined;
    this.destination = undefined;
    if (this.fallback && !this.fallback.destroyed) this.fallback.destroy();
    this.fallback = undefined;
    if (token && !token.destroyed && token._plannedMovement && game.user.id in token._plannedMovement) {
      delete token._plannedMovement[game.user.id];
      token.renderFlags.set({ refreshRuler: true, refreshState: true });
    }
  }

  private step(now: number) {
    this.frame = requestAnimationFrame((next) => this.step(next));
    const seconds = Math.min(now - this.last, 100) / 1000;
    this.last = now;
    const gamepad = navigator.getGamepads()[this.gamepadIndex];
    if (!gamepad || !this.read || !this.token) return;
    const stick = this.read(gamepad);
    const length = Math.hypot(stick.x, stick.y);
    if (length < DEAD_ZONE) return;
    // a stick that is pushed a little moves slowly, for the last foot
    const speed = (SPEED * Math.min(length, 1) * seconds) / canvas.stage.scale.x;
    this.moveBy((stick.x / length) * speed * Math.min(length, 1), (stick.y / length) * speed * Math.min(length, 1));
  }

  /**
   * Moves the destination, as far as the token can go there in a straight line. Along a wall it slides.
   */
  private moveBy(dx: number, dy: number) {
    const from = this.destination;
    if (!from || !this.token) return;
    const to = [
      { x: from.x + dx, y: from.y + dy },
      { x: from.x + dx, y: from.y },
      { x: from.x, y: from.y + dy },
    ].find((candidate) => this.reachable(candidate));
    if (!to || (to.x === from.x && to.y === from.y)) return;
    this.destination = to;
    this.show();
    const now = Date.now();
    if (now - this.followedAt > FOLLOW_INTERVAL) {
      this.followedAt = now;
      bringIntoView({ center: this.token.getCenterPoint(to) });
    }
  }

  private reachable(position: Point): boolean {
    const token = this.token;
    const center = token.getCenterPoint(position);
    if (!canvas.dimensions.rect.contains(center.x, center.y)) return false;
    return !token.checkCollision(center, { origin: token.getCenterPoint(this.origin) });
  }

  private waypoint(): any | undefined {
    if (!this.origin || !this.destination) return undefined;
    return { ...this.origin, x: Math.round(this.destination.x), y: Math.round(this.destination.y) };
  }

  /**
   * Shows the movement with the ruler of the token, the way foundry does while a token is dragged.
   */
  private show() {
    const token = this.token;
    try {
      const document = token.document;
      const history: any[] = document.movementHistory ?? [];
      const foundPath: any[] = document.getCompleteMovementPath(
        token.createTerrainMovementPath([{ ...this.origin }, this.waypoint()], { preview: true }),
      );
      const measurement = token.measureMovementPath([...history, ...foundPath], { preview: true });
      foundPath.forEach((waypoint, index) => {
        waypoint.cost = measurement.waypoints[history.length + index]?.backward?.cost ?? 0;
      });
      Object.assign(foundPath[0], { terrain: null, snapped: false, explicit: false, checkpoint: true, cost: 0 });
      const isNew = !(game.user.id in token._plannedMovement);
      token._plannedMovement[game.user.id] = {
        foundPath,
        unreachableWaypoints: [],
        history,
        hidden: false,
        searching: false,
      };
      token.renderFlags.set({ refreshRuler: true, refreshState: isNew });
    } catch (e) {
      if (!this.fallback) {
        console.warn("combat-controller | the ruler of foundry can not show the planned movement, drawing a line", e);
      }
      this.drawFallback();
    }
  }

  private drawFallback() {
    const token = this.token;
    if (!this.fallback || this.fallback.destroyed) {
      this.fallback = new PIXI.Graphics();
      (canvas.interface ?? canvas.stage).addChild(this.fallback);
    }
    const from: Point = token.getCenterPoint(this.origin);
    const to: Point = token.getCenterPoint(this.destination);
    const color = parseInt(String(game.user.color).replace("#", ""), 16) || 0xffffff;
    const width = Math.max(4, canvas.grid.size * 0.06);
    const line = this.fallback;
    line.clear();
    line
      .lineStyle(width + 4, 0x000000, 0.6)
      .moveTo(from.x, from.y)
      .lineTo(to.x, to.y);
    line.lineStyle(width, color, 1).moveTo(from.x, from.y).lineTo(to.x, to.y);
    line.drawCircle(to.x, to.y, canvas.grid.size * 0.2);
  }
}
