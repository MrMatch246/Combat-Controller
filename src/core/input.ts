// Pure helpers that turn the state of a gamepad into single key strokes, no Foundry access.
// The tick events of BeaversGamepadManager repeat a held button after half a second, which is fine for moving a
// token but would use an item twice.

/**
 * Tells which buttons got pressed since the last update, a held button is reported once.
 */
export class PressTracker {
  /** the buttons that got released with the last update. */
  released: string[] = [];
  private held = new Set<string>();
  private last = -Infinity;

  /**
   * @param maxGap after a pause this long the tracker missed what happened meanwhile: buttons that are down then
   * have to be released first. A module is not ticked while another context module has the gamepad, and the button
   * that ended that context is usually still down.
   */
  constructor(private maxGap = 300) {}

  update(pressed: readonly string[], now: number): string[] {
    const resumed = now - this.last > this.maxGap;
    this.last = now;
    const fresh = resumed ? [] : pressed.filter((name) => !this.held.has(name));
    this.released = resumed ? [] : [...this.held].filter((name) => !pressed.includes(name));
    this.held = new Set(pressed);
    return fresh;
  }
}

/**
 * Steps once when a direction is pushed and keeps stepping while it is held, like a key of a keyboard.
 */
export class Repeater {
  private key = "";
  private next = 0;

  constructor(
    private delay = 400,
    private interval = 200,
  ) {}

  /**
   * @param key what is held right now, empty when nothing is held.
   * @returns true when a step is due.
   */
  update(key: string, now: number): boolean {
    if (key !== this.key) {
      this.key = key;
      this.next = now + this.delay;
      return key !== "";
    }
    if (key === "" || now < this.next) return false;
    this.next = now + this.interval;
    return true;
  }
}

/**
 * What of the state of a gamepad matters to the gamepad modules, as one string: which buttons are down and which
 * way the sticks are pushed. It changes exactly when a module should hear from the gamepad at once.
 * @param axisThreshold from where on an axis counts as pushed, the same as for the tick events.
 */
export function padSignature(pressed: readonly boolean[], axes: readonly number[], axisThreshold = 0.5): string {
  const buttons = pressed.map((down) => (down ? "1" : "0")).join("");
  const sticks = axes.map((value) => (value > axisThreshold ? "+" : value < -axisThreshold ? "-" : "0")).join("");
  return `${buttons}|${sticks}`;
}
