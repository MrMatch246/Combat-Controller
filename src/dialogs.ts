// Dialogs are made for mouse and keyboard. This moves a focus across the buttons and fields of the dialog on top, so
// the questions that come up while an item is used (which spell slot, advantage, what did the dice show, ...) can be
// answered with a gamepad.

import type { Point } from "./core/axes";
import { nextInDirection, type Rect } from "./core/spatial";
import { FocusMark } from "./focus";

// Dialogs, and windows that ask something without being one: the window physical-dice-rolls asks for the result of
// the real dice with, and the one dnd5e lets the player choose between the activities of an item with. Other
// windows, like the sheet of an actor, are not something a gamepad should get caught in.
const DIALOG_SELECTOR = [
  "dialog.application",
  ".application.dialog",
  ".window-app.dialog",
  ".application.real-roll",
  ".application.activity-choice",
].join(", ");
const FIELD_SELECTOR =
  'button, select, input:not([type="hidden"]), textarea, dnd5e-checkbox, slide-toggle, a[data-action]';
// the button that answers a dialog when the player just confirms, the most likely first
const CONFIRM_SELECTORS = [
  "button[autofocus]",
  "button.default",
  'button[data-action="normal"]',
  'button[type="submit"]',
  "footer button",
  ".form-footer button",
];

// how far the modifier changes a number with one step
const JUMP = 5;

/** the dialog that lies on top of all others. */
export function topDialog(): HTMLElement | undefined {
  let top: HTMLElement | undefined;
  let topIndex = -Infinity;
  document.querySelectorAll<HTMLElement>(DIALOG_SELECTOR).forEach((dialog) => {
    const rect = dialog.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const zIndex = Number(getComputedStyle(dialog).zIndex) || 0;
    // a later dialog lies above an earlier one with the same z-index
    if (zIndex >= topIndex) {
      top = dialog;
      topIndex = zIndex;
    }
  });
  return top;
}

/**
 * The focus of a gamepad within the dialog on top.
 */
export class DialogControl {
  private dialog?: HTMLElement;
  private index = 0;
  private focus = new FocusMark();

  /**
   * Call this on every tick: dialogs open and render whenever they like.
   * @returns true while a dialog is open, the gamepad then belongs to that dialog.
   */
  sync(color: string): boolean {
    const dialog = topDialog();
    if (!dialog) {
      this.clear();
      return false;
    }
    const fields = this.fields(dialog);
    if (dialog !== this.dialog) {
      this.dialog = dialog;
      const start = startField(fields);
      this.index = start ? fields.indexOf(start) : 0;
    }
    // a dialog that renders again has new elements, the focus stays at its place
    this.index = Math.min(this.index, Math.max(0, fields.length - 1));
    this.mark(fields[this.index], color);
    return true;
  }

  /**
   * Up and down change the value of a number or a select, everything else moves the focus. Left and right reach
   * every field: where nothing lies in that direction they go on with the field before or after.
   * @param modified the modifier is held: up and down change a number by 5, so the result of a die is quickly set.
   */
  move(direction: Point, color: string, modified = false) {
    if (!this.dialog) return;
    const fields = this.fields(this.dialog);
    const field = fields[this.index];
    if (field && direction.y !== 0) {
      const steps = modified && field instanceof HTMLInputElement ? JUMP : 1;
      let stepped = false;
      for (let i = 0; i < steps; i++) stepped = step(field, direction.y);
      if (stepped) return;
    }
    // a form is read line by line: left and right stay in the row, up and down may go to whatever is closest
    let next = nextInDirection(fields.map(rectOf), this.index, direction, direction.x !== 0);
    if (next < 0 && direction.x !== 0) {
      next = this.index + direction.x;
    }
    if (fields[next]) {
      this.index = next;
      this.mark(fields[next], color);
    }
  }

  /**
   * Presses the focused button. On a field that holds a value it confirms the dialog instead, like the enter key.
   */
  ok() {
    const field = this.focus.element;
    if (!this.dialog || !field?.isConnected) return;
    if (hasValue(field)) {
      const fields = this.fields(this.dialog);
      CONFIRM_SELECTORS.map((selector) => fields.find((candidate) => candidate.matches(selector)))
        .find((candidate) => candidate)
        ?.click();
    } else {
      field.click();
    }
  }

  /** closes the dialog without an answer. */
  back() {
    const dialog = this.dialog;
    if (!dialog) return;
    const app = foundry.applications.instances.get(dialog.id) ?? ui.windows?.[dialog.dataset.appid ?? ""];
    if (app) {
      app.close();
    } else {
      dialog.querySelector<HTMLElement>('[data-action="close"], .header-button.close')?.click();
    }
  }

  clear() {
    this.mark(undefined, "");
    this.dialog = undefined;
    this.index = 0;
  }

  private fields(dialog: HTMLElement): HTMLElement[] {
    const content = dialog.querySelector<HTMLElement>(".window-content") ?? dialog;
    return Array.from(content.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).filter((field) => {
      if ((field as HTMLButtonElement).disabled) return false;
      const rect = field.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  private mark(field: HTMLElement | undefined, color: string) {
    if (field === this.focus.element) return;
    this.focus.set(field, color);
    if (field) {
      field.focus({ preventScroll: true });
      field.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }
}

function rectOf(element: HTMLElement): Rect {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
}

/** a field the player fills in, not one that is pressed. */
function hasValue(field: HTMLElement): boolean {
  if (field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) return true;
  if (!(field instanceof HTMLInputElement)) return false;
  return !["checkbox", "radio", "button", "submit", "reset"].includes(field.type);
}

/**
 * The field a dialog starts at: what the dialog focused itself, else its default button, else its first field.
 */
function startField(fields: HTMLElement[]): HTMLElement | undefined {
  return (
    fields.find((field) => field === document.activeElement) ??
    fields.find((field) => field.matches("[autofocus], button.default, button[data-action='normal']")) ??
    fields[0]
  );
}

/**
 * Changes the value of a field by one step: down is the next option of a select, up is more of a number. A number
 * that has a lowest and a highest value goes round in a circle, so the result of a d20 is never more than ten steps
 * away.
 * @param direction 1 for down, -1 for up.
 * @returns false for a field without a value to step through.
 */
function step(field: HTMLElement, direction: number): boolean {
  if (field instanceof HTMLSelectElement) {
    let index = field.selectedIndex + direction;
    while (field.options[index]?.disabled) index += direction;
    if (field.options[index]) {
      field.selectedIndex = index;
      changed(field);
    }
    return true;
  }
  if (field instanceof HTMLInputElement && (field.type === "number" || field.type === "range")) {
    // the dice of physical-dice-rolls allow 0, which no die shows
    const isDie = field.classList.contains("real-roll-input") && !field.classList.contains("total");
    const min = isDie ? 1 : field.min === "" ? undefined : Number(field.min);
    const max = field.max === "" ? undefined : Number(field.max);
    const value = field.value === "" ? undefined : Number(field.value);
    const before = field.value;
    if (direction < 0) {
      if (value === undefined) field.value = String(min ?? 0);
      else if (max !== undefined && min !== undefined && value >= max) field.value = String(min);
      else stepNative(field, 1);
    } else {
      if (max !== undefined && (value === undefined || (min !== undefined && value <= min))) field.value = String(max);
      else if (value === undefined) field.value = String(min ?? 0);
      else stepNative(field, -1);
    }
    if (field.value !== before) changed(field);
    return true;
  }
  return false;
}

function stepNative(field: HTMLInputElement, direction: number) {
  try {
    if (direction > 0) field.stepUp();
    else field.stepDown();
  } catch (e) {
    // a field with step="any" can not be stepped
  }
}

function changed(field: HTMLElement) {
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}
