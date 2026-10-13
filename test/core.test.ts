import { describe, expect, it } from "vitest";
import { readAxis } from "../src/core/axes";
import { CaptureSession, axisDirection, isNeutral, snapshot, type PadSnapshot } from "../src/core/capture";
import { doorsInFront, stepBack } from "../src/core/door";
import { DEFAULT_BINDINGS, buttonName, withStored } from "../src/bindings";

const pad = (buttons: number[], axes: number[]): PadSnapshot => ({ buttons, axes });

describe("capture buttons", () => {
  it("picks the first button that gets pressed", () => {
    const session = new CaptureSession("buttons", pad([0, 0, 0], []));
    expect(session.update(pad([0, 0, 0], []))).toBeNull();
    expect(session.update(pad([0, 0, 1], []))).toEqual({ kind: "buttons", index: 2 });
  });

  // The click on "detect" is often done with a button still held down, e.g. a resting trigger finger.
  it("ignores a button that is held down from the start until it got released once", () => {
    const session = new CaptureSession("buttons", pad([1, 0], []));
    expect(session.update(pad([1, 0], []))).toBeNull();
    expect(session.update(pad([0, 0], []))).toBeNull();
    expect(session.update(pad([1, 0], []))).toEqual({ kind: "buttons", index: 0 });
  });

  it("takes an analog trigger only when it is pressed more than half way", () => {
    const session = new CaptureSession("buttons", pad([0], []));
    expect(session.update(pad([0.3], []))).toBeNull();
    expect(session.update(pad([0.7], []))).toEqual({ kind: "buttons", index: 0 });
  });

  it("ignores sticks", () => {
    const session = new CaptureSession("buttons", pad([0], [0, 0]));
    expect(session.update(pad([0], [1, -1]))).toBeNull();
  });
});

describe("capture axes", () => {
  it("picks the axis that got pushed and tells the direction", () => {
    const session = new CaptureSession("axes", pad([], [0, 0, 0, 0]));
    expect(session.update(pad([], [0, 0.2, 0, 0]))).toBeNull();
    expect(session.update(pad([], [0, 0, 0.9, 0]))).toEqual({ kind: "axes", index: 2, reversed: false });
    expect(session.update(pad([], [0, -0.9, 0, 0]))).toEqual({ kind: "axes", index: 1, reversed: true });
  });

  it("picks the axis that moved the most when the stick is pushed diagonal", () => {
    const session = new CaptureSession("axes", pad([], [0, 0]));
    expect(session.update(pad([], [0.7, -1]))).toEqual({ kind: "axes", index: 1, reversed: true });
  });

  // Triggers mapped as axes rest at -1, hat switches at odd values like 1.29.
  it("measures from the resting value of an axis, not from 0", () => {
    const session = new CaptureSession("axes", pad([], [-1, 1.29, 0]));
    expect(session.update(pad([], [-1, 1.29, 0]))).toBeNull();
    expect(session.update(pad([], [1, 1.29, 0]))).toEqual({ kind: "axes", index: 0, reversed: false });
  });

  it("ignores buttons", () => {
    const session = new CaptureSession("axes", pad([0], [0]));
    expect(session.update(pad([1], [0]))).toBeNull();
  });
});

describe("capture helpers", () => {
  it("snapshot reads buttons and axes of a gamepad", () => {
    const gamepad = {
      buttons: [
        { pressed: true, value: 0 },
        { pressed: false, value: 0.2 },
      ],
      axes: [0.5, -1],
    };
    expect(snapshot(gamepad)).toEqual({ buttons: [1, 0.2], axes: [0.5, -1] });
  });

  it("isNeutral: nothing pressed and all axes back at rest", () => {
    const rest = pad([0, 0], [-1, 0]);
    expect(isNeutral(rest, pad([0, 0], [-0.9, 0.1]))).toBe(true);
    expect(isNeutral(rest, pad([0, 1], [-1, 0]))).toBe(false);
    expect(isNeutral(rest, pad([0, 0], [0, 0]))).toBe(false);
  });

  it("axisDirection asks for the direction named by the module", () => {
    expect(axisDirection("Move-horizontal")).toBe("right");
    expect(axisDirection("vertical")).toBe("down");
    expect(axisDirection("zoom")).toBe("any");
  });
});

describe("doors", () => {
  // Token at (100, 100). Scene y points down, rotation 0 faces down.
  const center = { x: 100, y: 100 };
  const below = { door: "below", c: [50, 150, 150, 150] };
  const above = { door: "above", c: [50, 60, 150, 60] };
  const far = { door: "far", c: [50, 400, 150, 400] };

  it("finds the door the token faces", () => {
    expect(doorsInFront(center, 0, [below, above, far], 150).map((d) => d.door)).toEqual(["below"]);
    expect(doorsInFront(center, 180, [below, above, far], 150).map((d) => d.door)).toEqual(["above"]);
  });

  it("finds no door to the side of the token", () => {
    expect(doorsInFront(center, 90, [below, above], 150)).toEqual([]);
  });

  it("lists every door in reach, nearest first, for a token that does not rotate", () => {
    expect(doorsInFront(center, 0, [below, above, far], 150, 360).map((d) => d.door)).toEqual(["above", "below"]);
  });

  it("stepBack stops a few pixels before the target", () => {
    expect(stepBack({ x: 0, y: 0 }, { x: 100, y: 0 }, 5)).toEqual({ x: 95, y: 0 });
    expect(stepBack({ x: 0, y: 0 }, { x: 3, y: 0 }, 5)).toEqual({ x: 0, y: 0 });
  });
});

describe("readAxis", () => {
  it("reads the bound axis and flips a reversed one", () => {
    expect(readAxis({ index: 1, reversed: false }, [0.2, -0.8])).toBe(-0.8);
    expect(readAxis({ index: 1, reversed: true }, [0.2, -0.8])).toBe(0.8);
  });

  it("is 0 for an axis the gamepad or the bindings do not have", () => {
    expect(readAxis({ index: 5, reversed: false }, [0.2])).toBe(0);
    expect(readAxis(undefined, [0.2])).toBe(0);
  });
});

describe("bindings", () => {
  it("are the defaults when the player changed nothing", () => {
    expect(withStored(undefined)).toEqual(DEFAULT_BINDINGS);
    expect(withStored({})).toEqual(DEFAULT_BINDINGS);
  });

  it("take what the player changed without touching the defaults", () => {
    const bindings = withStored({
      axes: { "move-horizontal": { index: 2, reversed: true } },
      buttons: { ok: { index: 3 } },
    });
    expect(bindings.axes["move-horizontal"]).toEqual({ index: 2, reversed: true });
    expect(bindings.buttons.ok.index).toBe(3);
    expect(bindings.buttons.back.index).toBe(1);
    expect(DEFAULT_BINDINGS.buttons.ok.index).toBe(0);
  });

  // what an older version stored must not break a newer one
  it("ignore what is unknown or broken", () => {
    const bindings = withStored({ buttons: { gone: { index: 4 }, ok: { index: "x" as any } } });
    expect(bindings.buttons.gone).toBeUndefined();
    expect(bindings.buttons.ok.index).toBe(0);
  });

  it("name the buttons of a standard gamepad", () => {
    expect(buttonName(0)).toBe("A");
    expect(buttonName(9)).toBe("Start");
    expect(buttonName(23)).toBe("#23");
  });
});
