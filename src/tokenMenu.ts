// The token hud of foundry, the menu that opens with a right click on a token: status effects, target, combat ...
// This opens it without a mouse and moves a focus across its buttons.

import type { Point } from "./core/axes";
import { nextInDirection, type Rect } from "./core/spatial";
import { FocusMark } from "./focus";

/**
 * The focus of a gamepad within the token hud of one token.
 */
export class TokenMenuControl {
  private tokenId?: string;
  private opening = false;
  private index = 0;
  // the palette the focus is in, e.g. the status effects. Null for the buttons of the hud itself.
  private palette: string | null = null;
  private mark = new FocusMark();

  private get hud(): any | undefined {
    return canvas?.hud?.token;
  }

  open(token: any) {
    const hud = this.hud;
    if (!hud) return;
    this.tokenId = token.id;
    this.index = 0;
    this.palette = null;
    this.opening = true;
    Promise.resolve(hud.bind(token))
      .catch(console.error)
      .finally(() => (this.opening = false));
  }

  close() {
    const wasOpen = this.isOpen();
    this.mark.clear();
    this.tokenId = undefined;
    this.opening = false;
    if (wasOpen) this.hud.close();
  }

  /**
   * Call this on every tick: the menu renders again when the token changes, and a click elsewhere closes it.
   * @returns true while the menu this control opened is open, the gamepad then belongs to that menu.
   */
  sync(color: string): boolean {
    if (this.opening) return true;
    if (!this.isOpen()) {
      this.mark.clear();
      this.tokenId = undefined;
      return false;
    }
    const palette: string | null = this.hud.activePalette ?? null;
    if (palette !== this.palette) {
      // into a palette: its first entry. Out of it: the button that opened it.
      const from = this.palette;
      this.palette = palette;
      this.index = palette
        ? 0
        : Math.max(
            0,
            this.items().findIndex((item) => item.dataset.palette === from),
          );
    }
    const items = this.items();
    this.index = Math.min(this.index, Math.max(0, items.length - 1));
    this.mark.set(items[this.index], color);
    return true;
  }

  move(direction: Point) {
    if (!this.isOpen()) return;
    const next = nextInDirection(this.items().map(rectOf), this.index, direction);
    if (next >= 0) this.index = next;
  }

  /** presses the focused button, a button with a palette opens it. */
  ok() {
    if (this.mark.element?.isConnected) {
      this.mark.element.click();
    }
  }

  /** leaves the palette, or the menu when no palette is open. */
  back() {
    if (!this.isOpen()) return;
    if (this.hud.activePalette) {
      this.hud.togglePalette(null);
    } else {
      this.close();
    }
  }

  private isOpen(): boolean {
    const hud = this.hud;
    return !!this.tokenId && !!hud?.rendered && hud.object?.id === this.tokenId;
  }

  private items(): HTMLElement[] {
    const root: HTMLElement = this.hud.element;
    const selector = this.palette ? `.palette[data-palette="${this.palette}"] [data-action]` : ".control-icon";
    return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((item) => {
      if ((item as HTMLButtonElement).disabled) return false;
      const rect = item.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }
}

function rectOf(element: HTMLElement): Rect {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
}
