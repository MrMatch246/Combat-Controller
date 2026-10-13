// Reads the gamepads of the browser and tells the controller what they do.

import { padSignature } from "./core/input";

// The controller gets a tick this often while nothing changes on the gamepad.
const TICK_INTERVAL = 100;

/**
 * One player sits at this screen. When several gamepads are connected, the one that was used last is the gamepad of
 * the player.
 *
 * The gamepads are read with every frame. The gamepad ticks every 100ms, and at once when one of its buttons or
 * sticks changes: a press does not have to wait for the next regular tick.
 */
export class Gamepads {
  // while this is set the controller gets nothing, the configuration listens to the gamepad then
  suspended = false;
  private signatures: { [index: number]: string } = {};
  private activeIndex?: number;
  private tickedAt = 0;

  constructor(private onTick: (gamepad: Gamepad, now: number) => void) {
    const poll = () => {
      this.read();
      window.requestAnimationFrame(poll);
    };
    window.requestAnimationFrame(poll);
    // A window in the background gets no frames, but may still get what the gamepad does.
    window.setInterval(() => {
      if (document.hidden) this.read();
    }, TICK_INTERVAL);
  }

  /** the gamepad of the player, as the browser sees it right now. */
  get active(): Gamepad | undefined {
    return (this.activeIndex === undefined ? undefined : navigator.getGamepads()[this.activeIndex]) ?? undefined;
  }

  private read() {
    let changed = false;
    for (const gamepad of navigator.getGamepads()) {
      if (!gamepad) continue;
      const signature = padSignature(
        gamepad.buttons.map((button) => button.pressed),
        gamepad.axes,
      );
      if (signature !== this.signatures[gamepad.index]) {
        // A gamepad that is seen for the first time may rest with a trigger half pushed. Only one that does
        // something takes over.
        if (this.signatures[gamepad.index] !== undefined || this.activeIndex === undefined) {
          this.activeIndex = gamepad.index;
          changed = true;
        }
        this.signatures[gamepad.index] = signature;
      }
    }
    const gamepad = this.active;
    const now = Date.now();
    if (!gamepad || this.suspended || (!changed && now - this.tickedAt < TICK_INTERVAL)) return;
    this.tickedAt = now;
    try {
      this.onTick(gamepad, now);
    } catch (e) {
      console.error(e);
    }
  }
}
