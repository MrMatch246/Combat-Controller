import { describe, expect, it } from "vitest";
import { PressTracker, Repeater, padSignature } from "../src/core/input";
import { dominantDirection, nearest, nextInDirection, type Rect } from "../src/core/spatial";
import { barItems, findItem, firstItem, openPanelOwner, panelItems } from "../src/argon/hud";

const rect = (x: number, y: number, width = 100, height = 100): Rect => ({ x, y, width, height });
const RIGHT = { x: 1, y: 0 };
const LEFT = { x: -1, y: 0 };
const UP = { x: 0, y: -1 };
const DOWN = { x: 0, y: 1 };

describe("dominantDirection", () => {
  it("is undefined while the stick rests", () => {
    expect(dominantDirection({ x: 0.3, y: -0.4 })).toBeUndefined();
  });

  it("picks the stronger axis of a stick that is not pushed straight", () => {
    expect(dominantDirection({ x: 0.6, y: -0.9 })).toEqual(UP);
    expect(dominantDirection({ x: -1, y: 0.7 })).toEqual(LEFT);
  });
});

describe("nextInDirection", () => {
  // the action bar of argon: a button, two half buttons on top of each other, a button
  const bar = [rect(0, 0, 100, 200), rect(110, 0, 100, 100), rect(110, 100, 100, 100), rect(220, 0, 100, 200)];

  it("walks along a row", () => {
    const row = [rect(0, 0), rect(110, 0), rect(220, 0)];
    expect(nextInDirection(row, 0, RIGHT)).toBe(1);
    expect(nextInDirection(row, 1, RIGHT)).toBe(2);
    expect(nextInDirection(row, 2, LEFT)).toBe(1);
  });

  it("stays when there is nothing in that direction", () => {
    const row = [rect(0, 0), rect(110, 0)];
    expect(nextInDirection(row, 1, RIGHT)).toBe(-1);
    expect(nextInDirection(row, 0, UP)).toBe(-1);
    expect(nextInDirection(row, 5, RIGHT)).toBe(-1);
  });

  it("enters the upper one of two stacked buttons from a tall button and moves between them", () => {
    expect(nextInDirection(bar, 0, RIGHT)).toBe(1);
    expect(nextInDirection(bar, 1, DOWN)).toBe(2);
    expect(nextInDirection(bar, 2, UP)).toBe(1);
  });

  it("leaves both stacked buttons to the tall button next to them", () => {
    expect(nextInDirection(bar, 1, RIGHT)).toBe(3);
    expect(nextInDirection(bar, 2, RIGHT)).toBe(3);
    expect(nextInDirection(bar, 2, LEFT)).toBe(0);
  });

  it("prefers the neighbour in the same row over a closer one in the next row", () => {
    // second row is shifted a bit to the right
    const grid = [rect(0, 0), rect(110, 0), rect(5, 104), rect(115, 104)];
    expect(nextInDirection(grid, 0, RIGHT)).toBe(1);
    expect(nextInDirection(grid, 0, DOWN)).toBe(2);
    expect(nextInDirection(grid, 3, UP)).toBe(1);
  });

  it("reaches something that is only roughly in that direction when nothing is straight ahead", () => {
    // tokens on a map
    const tokens = [rect(0, 0), rect(300, 250), rect(40, 700)];
    expect(nextInDirection(tokens, 0, RIGHT)).toBe(1);
    expect(nextInDirection(tokens, 0, DOWN)).toBe(2);
    expect(nextInDirection(tokens, 1, LEFT)).toBe(0);
  });

  it("can be told to stay in the row or column", () => {
    const form = [rect(0, 0, 300, 30), rect(0, 40, 100, 30), rect(110, 40, 100, 30)];
    expect(nextInDirection(form, 0, RIGHT)).toBe(2);
    expect(nextInDirection(form, 0, RIGHT, true)).toBe(-1);
    expect(nextInDirection(form, 1, RIGHT, true)).toBe(2);
    // the row below touches the fields above it
    const tight = [rect(0, 0, 100, 30), rect(0, 30, 100, 30), rect(110, 30, 100, 30)];
    expect(nextInDirection(tight, 0, RIGHT, true)).toBe(-1);
  });
});

describe("nearest", () => {
  it("finds the rect closest to a point", () => {
    expect(nearest([rect(0, 0), rect(500, 0), rect(200, 0)], { x: 260, y: 40 })).toBe(2);
    expect(nearest([], { x: 0, y: 0 })).toBe(-1);
  });
});

describe("PressTracker", () => {
  it("tells which buttons got released", () => {
    const tracker = new PressTracker();
    tracker.update([], 0);
    tracker.update(["ok", "back"], 100);
    expect(tracker.released).toEqual([]);
    tracker.update(["back"], 200);
    expect(tracker.released).toEqual(["ok"]);
    tracker.update(["back"], 300);
    expect(tracker.released).toEqual([]);
  });

  it("reports a button once, however long it is held", () => {
    const tracker = new PressTracker();
    tracker.update([], 0);
    expect(tracker.update(["ok"], 100)).toEqual(["ok"]);
    expect(tracker.update(["ok"], 200)).toEqual([]);
    expect(tracker.update([], 300)).toEqual([]);
    expect(tracker.update(["ok", "back"], 400)).toEqual(["ok", "back"]);
  });

  // e.g. the button that confirmed a choice in the tiny ui must not use the focused item of the hud.
  it("ignores a button that is already down when the ticks start or come back after a pause", () => {
    const tracker = new PressTracker();
    expect(tracker.update(["ok"], 0)).toEqual([]);
    expect(tracker.update(["ok"], 100)).toEqual([]);
    expect(tracker.update([], 200)).toEqual([]);
    expect(tracker.update(["ok"], 2000)).toEqual([]);
    expect(tracker.update([], 2100)).toEqual([]);
    expect(tracker.update(["ok"], 2200)).toEqual(["ok"]);
  });
});

describe("padSignature", () => {
  it("changes when a button goes down or up", () => {
    const idle = padSignature([false, false], [0, 0]);
    expect(padSignature([false, true], [0, 0])).not.toBe(idle);
    expect(padSignature([false, false], [0, 0])).toBe(idle);
  });

  it("changes when a stick gets pushed, not while it is moved a little", () => {
    const idle = padSignature([false], [0, 0]);
    expect(padSignature([false], [0.3, -0.2])).toBe(idle);
    expect(padSignature([false], [0.7, 0])).not.toBe(idle);
    expect(padSignature([false], [0.7, 0])).toBe(padSignature([false], [0.9, 0.1]));
    expect(padSignature([false], [-0.7, 0])).not.toBe(padSignature([false], [0.7, 0]));
  });
});

describe("Repeater", () => {
  it("steps at once, then repeats after a delay while the direction is held", () => {
    const repeater = new Repeater(400, 200);
    expect(repeater.update("right", 0)).toBe(true);
    expect(repeater.update("right", 100)).toBe(false);
    expect(repeater.update("right", 300)).toBe(false);
    expect(repeater.update("right", 400)).toBe(true);
    expect(repeater.update("right", 500)).toBe(false);
    expect(repeater.update("right", 600)).toBe(true);
  });

  it("steps at once when the direction changes and not at all when nothing is held", () => {
    const repeater = new Repeater(400, 200);
    expect(repeater.update("right", 0)).toBe(true);
    expect(repeater.update("down", 100)).toBe(true);
    expect(repeater.update("", 200)).toBe(false);
    expect(repeater.update("", 900)).toBe(false);
    expect(repeater.update("down", 1000)).toBe(true);
  });
});

// The components of argon as far as the gamepad looks at them.
const element = (visible = true, title?: any): any => ({
  isConnected: true,
  getBoundingClientRect: () => (visible ? rect(0, 0) : rect(0, 0, 0, 0)),
  querySelector: () => title ?? null,
});
const button = (extra: any = {}): any => ({ element: element(), ...extra });
const panelButton = (panel: any): any => ({ element: element(), _getPanel: () => panel, panel });
const split = (button1: any, button2: any): any => ({ element: element(), button1, button2 });
const category = (visible: boolean, buttons: any[]): any => ({
  element: element(true, element()),
  visible,
  buttons,
});

describe("items of the argon hud", () => {
  const spells = { visible: false, _subPanels: [category(true, [button(), button()]), category(false, [button()])] };
  const features = { visible: false, _buttons: [button(), button({ element: element(false) })] };
  const hud = {
    components: {
      main: [
        { buttons: [button(), split(button(), button()), panelButton(spells), panelButton(features)] },
        { buttons: [button({ visible: false }), button({ element: element(false) })] },
        { buttons: [button()] },
      ],
    },
  };
  const keys = (items: { key: string }[]) => items.map((item) => item.key);

  it("lists the buttons of all action panels, split buttons as two, hidden ones not at all", () => {
    const items = barItems(hud);
    expect(keys(items)).toEqual(["0.0", "0.1.0", "0.1.1", "0.2", "0.3", "2.0"]);
    expect(items.map((item) => item.kind)).toEqual(["button", "button", "button", "panel", "panel", "button"]);
  });

  it("finds the panel that is open", () => {
    expect(openPanelOwner(hud)).toBeUndefined();
    features.visible = true;
    expect(openPanelOwner(hud)?.key).toBe("0.3");
    features.visible = false;
  });

  it("lists the visible buttons of a plain panel", () => {
    expect(keys(panelItems(barItems(hud)[4]))).toEqual(["0.3/0"]);
  });

  it("lists the titles of all categories of a panel but only the buttons of the expanded ones", () => {
    const items = panelItems(barItems(hud)[3]);
    expect(keys(items)).toEqual(["0.2/0", "0.2/0.0", "0.2/0.1", "0.2/1"]);
    expect(items.map((item) => item.kind)).toEqual(["category", "button", "button", "category"]);
    expect(firstItem(items)?.key).toBe("0.2/0.0");
  });

  it("finds an item again after argon rendered, or the button of its panel when the panel got closed", () => {
    const bar = barItems(hud);
    expect(findItem(bar, "0.1.1")?.key).toBe("0.1.1");
    expect(findItem(bar, "0.2/0.1")?.key).toBe("0.2");
    expect(findItem(bar, "7.0")).toBeUndefined();
    // a panel that was just opened: the focus is still on its button, which is not part of the panel
    expect(findItem(panelItems(bar[3]), "0.2")).toBeUndefined();
  });
});
