// What the sticks and buttons of the gamepad are used for. The defaults fit the standard gamepad of a browser,
// the player can change every one of them.

import type { AxisBinding } from "./core/axes";

export interface ButtonBinding {
  index: number;
}

export interface Bindings {
  axes: { [name: string]: AxisBinding };
  buttons: { [name: string]: ButtonBinding };
}

export const DEFAULT_BINDINGS: Bindings = {
  axes: {
    // left stick: moves the token, the focus, the ring on a target, the area of a spell
    "move-horizontal": { index: 0, reversed: false },
    "move-vertical": { index: 1, reversed: false },
    // right stick: pans the map
    "pan-horizontal": { index: 2, reversed: false },
    "pan-vertical": { index: 3, reversed: false },
  },
  buttons: {
    ok: { index: 0 },
    back: { index: 1 },
    menu: { index: 2 },
    switch: { index: 3 },
    loadout: { index: 4 },
    jump: { index: 5 },
    disadvantage: { index: 6 },
    advantage: { index: 7 },
    toggle: { index: 8 },
    start: { index: 9 },
    drawer: { index: 10 },
    center: { index: 11 },
    up: { index: 12 },
    down: { index: 13 },
    left: { index: 14 },
    right: { index: 15 },
  },
};

// what the buttons of a standard gamepad are called, by their index
const BUTTON_NAMES = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "Back", "Start", "L3", "R3", "↑", "↓", "←", "→"];

/** how a player would call the button with this index. */
export function buttonName(index: number): string {
  return BUTTON_NAMES[index] ?? `#${index}`;
}

/**
 * The bindings to use: the defaults with what the player changed. A binding that a newer version added is there
 * with its default, one that it dropped is gone.
 */
export function withStored(stored: Partial<Bindings> | undefined): Bindings {
  const bindings: Bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
  for (const [name, axis] of Object.entries(bindings.axes)) {
    const own = stored?.axes?.[name];
    if (own && Number.isInteger(Number(own.index))) {
      axis.index = Number(own.index);
      axis.reversed = !!own.reversed;
    }
  }
  for (const [name, button] of Object.entries(bindings.buttons)) {
    const own = stored?.buttons?.[name];
    if (own && Number.isInteger(Number(own.index))) button.index = Number(own.index);
  }
  return bindings;
}
