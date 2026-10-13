// Systems let the player place the area of a spell on the map: a shape follows the mouse until a click places it.
// Since foundry 14 that is the placement of a region. This drives it with a gamepad: a stick moves a pointer of its
// own, and foundry is told that the mouse is there.

import type { Point } from "../core/axes";

// how far a fully pushed stick moves the shape, in screen pixels per second
const SPEED = 700;
const DEAD_ZONE = 0.2;
// how close the pointer may get to the edge of the screen. Foundry pans the map when the mouse is within 50 pixels.
const EDGE = 20;

function context(): any | undefined {
  return canvas?.regions?._placementContext ?? undefined;
}

/** foundry waits for a shape to be placed right now. */
export function isPlacing(): boolean {
  return !!context();
}

/**
 * Moves the shape that is placed. A tick comes every 100ms only, so this reads the stick on every frame.
 */
export class PlacementControl {
  private frame?: number;
  private last = 0;
  private gamepadIndex = -1;
  private read?: (gamepad: Gamepad) => Point;
  // Where the pointer of the gamepad is, on the screen. Like the mouse it stays there while the map is panned
  // below it, the shape then moves across the map.
  private pointer?: Point;

  /**
   * Call this on every tick while a shape is placed.
   * @param origin where the shape starts on the map: at the token that uses the spell.
   * @param read where the stick asks the shape to go at this moment, each axis from -1 to 1.
   */
  start(gamepadIndex: number, origin: Point, read: (gamepad: Gamepad) => Point) {
    this.gamepadIndex = gamepadIndex;
    this.read = read;
    if (!this.pointer) {
      this.pointer = this.onScreen(canvas.clientCoordinatesFromCanvas(origin));
      this.tellFoundry();
    }
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
    this.pointer = undefined;
  }

  /** moves the shape by whole grid spaces. */
  nudge(direction: Point) {
    const step = canvas.grid.size * canvas.stage.scale.x;
    this.moveBy(direction.x * step, direction.y * step);
  }

  /** turns the shape like the mouse wheel does, in steps of 15 degrees. */
  rotate(step: number) {
    if (isPlacing()) canvas.regions._onMouseWheel({ delta: step, shiftKey: true });
  }

  /** places the shape like a left click. */
  confirm() {
    const pointer = this.pointer;
    const placement = context();
    if (!pointer || !placement) return;
    // once more, so the shape is where the pointer is and nowhere else when it is placed
    this.tellFoundry();
    const shape = placement.shape;
    // The click is given to the placement alone at first: a real click on the map is also seen by everything else
    // that listens to the map.
    const position = canvas.canvasCoordinatesFromClient(pointer);
    try {
      canvas.stage.emit("pointerdown", {
        button: 0,
        shiftKey: false,
        x: pointer.x,
        y: pointer.y,
        getLocalPosition: () => ({ x: position.x, y: position.y }),
      });
    } catch (e) {
      console.warn("combat-controller | the placement did not take the click", e);
    }
    // Foundry goes on to the next shape or ends the placement right away. When neither happened the click did not
    // arrive, then the map gets a click like the mouse would send it.
    const now = context();
    if (now && now === placement && now.shape === shape) {
      console.warn("combat-controller | placement still waiting after the click, clicking the map instead");
      this.click();
    }
  }

  /** a left click on the map where the pointer is, as pointer events like the mouse sends them. */
  private click() {
    const pointer = this.pointer;
    const events = canvas.app?.renderer?.events;
    const view: HTMLElement | undefined = events?.domElement ?? canvas.app?.view;
    if (!pointer || !view) return;
    const init: PointerEventInit = {
      pointerId: events?.rootPointerEvent?.pointerId ?? 1,
      pointerType: "mouse",
      isPrimary: true,
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: pointer.x,
      clientY: pointer.y,
    };
    view.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
    view.dispatchEvent(new PointerEvent("pointerup", init));
  }

  cancel() {
    canvas.regions._cancelPlacement();
  }

  private step(now: number) {
    this.frame = requestAnimationFrame((next) => this.step(next));
    const seconds = Math.min(now - this.last, 100) / 1000;
    this.last = now;
    const gamepad = navigator.getGamepads()[this.gamepadIndex];
    if (!gamepad || !this.read || !isPlacing()) return;
    const stick = this.read(gamepad);
    const x = Math.abs(stick.x) > DEAD_ZONE ? stick.x : 0;
    const y = Math.abs(stick.y) > DEAD_ZONE ? stick.y : 0;
    if (x === 0 && y === 0) return;
    this.moveBy(x * SPEED * seconds, y * SPEED * seconds);
  }

  private moveBy(dx: number, dy: number) {
    if (!this.pointer) return;
    this.pointer = this.onScreen({ x: this.pointer.x + dx, y: this.pointer.y + dy });
    this.tellFoundry();
  }

  private onScreen(point: Point): Point {
    return {
      x: Math.min(Math.max(point.x, EDGE), window.innerWidth - EDGE),
      y: Math.min(Math.max(point.y, EDGE), window.innerHeight - EDGE),
    };
  }

  /**
   * Tells foundry that the mouse is where the pointer of the gamepad is, with a pointer event on the map like the
   * mouse would send it. Foundry keeps the place of the mouse in mind and moves the shape there again whenever the
   * map changes below it, so it has to believe that the mouse is here: a shape that was only put somewhere jumps
   * back to the real mouse with the next pan.
   */
  private tellFoundry() {
    const pointer = this.pointer;
    const events = canvas.app?.renderer?.events;
    const view: HTMLElement | undefined = events?.domElement ?? canvas.app?.view;
    if (!pointer || !view) return;
    const root = events?.rootPointerEvent;
    view.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: root?.pointerId ?? 1,
        pointerType: "mouse",
        isPrimary: true,
        bubbles: true,
        clientX: pointer.x,
        clientY: pointer.y,
      }),
    );
  }
}
