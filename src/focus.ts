// What a gamepad points at is marked with a class, the color of the user of the gamepad comes along as a css variable.

export const FOCUS_CLASS = "combat-controller-focus";
export const COLOR_VARIABLE = "--combat-controller-color";

/**
 * Marks one element at a time.
 */
export class FocusMark {
  private marked?: HTMLElement;

  get element(): HTMLElement | undefined {
    return this.marked;
  }

  set(element: HTMLElement | undefined, color: string) {
    // an element that got rendered anew lost its mark
    if (element === this.marked && element?.classList.contains(FOCUS_CLASS) !== false) return;
    this.clear();
    this.marked = element;
    if (element) {
      element.classList.add(FOCUS_CLASS);
      element.style.setProperty(COLOR_VARIABLE, color);
    }
  }

  clear() {
    if (this.marked) {
      this.marked.classList.remove(FOCUS_CLASS);
      this.marked.style.removeProperty(COLOR_VARIABLE);
    }
    this.marked = undefined;
  }
}
