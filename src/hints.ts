// A small bar that tells the player what the buttons of the gamepad do right now.

import { COLOR_VARIABLE } from "./focus";

export interface Hint {
  // the button as the player knows it, e.g. "A"
  button: string;
  // what it does, already localized
  text: string;
}

export class HintBar {
  private element?: HTMLElement;
  private shown = "";

  show(hints: Hint[], color: string) {
    const key = JSON.stringify([hints, color]);
    if (key === this.shown && this.element?.isConnected) return;
    this.shown = key;
    if (!this.element) {
      this.element = document.createElement("div");
      this.element.classList.add("combat-controller-hints");
    }
    this.element.style.setProperty(COLOR_VARIABLE, color);
    this.element.replaceChildren(
      ...hints.map((hint) => {
        const entry = document.createElement("span");
        const button = document.createElement("kbd");
        button.textContent = hint.button;
        entry.append(button, hint.text);
        return entry;
      }),
    );
    if (!this.element.isConnected) document.body.appendChild(this.element);
  }

  hide() {
    this.element?.remove();
    this.shown = "";
  }
}
