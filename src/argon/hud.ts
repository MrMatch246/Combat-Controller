// Access to Argon - Combat HUD (enhancedcombathud). Argon has no api to drive it without a mouse, but its hud is
// built out of component objects that hang at ui.ARGON. This walks those components to know what can be focused,
// and uses the listeners the components registered themselves to use what is focused.

import type { Rect } from "../core/spatial";
import { COLOR_VARIABLE, FOCUS_CLASS } from "../focus";

// the hud fades out while the mouse is not over it, this class keeps it visible
export const CONTROL_CLASS = "combat-controller-control";
// how long the focus waits for its item to come back while argon renders
const LOST_TIMEOUT = 1500;

export type HudItemKind =
  // uses an item, an action, a macro ...
  | "button"
  // opens a panel with further buttons, e.g. the spells
  | "panel"
  // the title of a category within such a panel, e.g. a spell level. It expands and collapses its buttons.
  | "category";

export interface HudItem {
  // where the item sits in the hud. The components are rebuilt whenever argon renders, the key finds the item again.
  key: string;
  kind: HudItemKind;
  component: any;
  element: HTMLElement;
}

/** the hud of argon, it exists once the ready hook of argon ran. */
export function argonHud(): any | undefined {
  return ui.ARGON;
}

/** the hud shows this actor and its components are rendered. */
export function isHudReady(hud: any, actor: any): boolean {
  if (!hud?.rendered || !actor || hud._actor !== actor) return false;
  const panels: any[] = hud.components?.main ?? [];
  return panels.some((panel) => panel.buttons?.some((button: any) => button.element?.isConnected));
}

export function isVisible(element: HTMLElement | undefined | null): element is HTMLElement {
  if (!element?.isConnected) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function rectOf(element: HTMLElement): Rect {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
}

/**
 * The buttons of the action panels at the bottom of the hud: action, bonus action, reaction ...
 */
export function barItems(hud: any): HudItem[] {
  const items: HudItem[] = [];
  const panels: any[] = hud?.components?.main ?? [];
  panels.forEach((panel, panelIndex) => {
    (panel.buttons ?? []).forEach((button: any, index: number) => collect(items, button, `${panelIndex}.${index}`));
  });
  return items;
}

/**
 * The panel that is open right now, argon shows one at a time.
 * @returns the item of the bar that owns the panel.
 */
export function openPanelOwner(hud: any): HudItem | undefined {
  return barItems(hud).find((item) => item.kind === "panel" && item.component.panel?.visible);
}

/**
 * What can be focused within the panel of a bar item.
 */
export function panelItems(owner: HudItem): HudItem[] {
  const items: HudItem[] = [];
  const panel = owner.component.panel;
  const categories: any[] | undefined = panel?._subPanels;
  if (categories) {
    categories.forEach((category, categoryIndex) => {
      const key = `${owner.key}/${categoryIndex}`;
      const title = category.element?.querySelector(".feature-accordion-title") as HTMLElement | null;
      if (isVisible(title)) {
        items.push({ key, kind: "category", component: category, element: title });
      }
      // the buttons of a collapsed category are still there, squeezed to no width
      if (category.visible) {
        (category.buttons ?? []).forEach((button: any, index: number) => collect(items, button, `${key}.${index}`));
      }
    });
  } else {
    (panel?._buttons ?? []).forEach((button: any, index: number) => collect(items, button, `${owner.key}/${index}`));
  }
  return items;
}

function collect(items: HudItem[], component: any, key: string) {
  if (!component) return;
  // a split button is two buttons on top of each other
  if (component.button1 || component.button2) {
    collect(items, component.button1, `${key}.0`);
    collect(items, component.button2, `${key}.1`);
    return;
  }
  if (component.visible === false || !isVisible(component.element)) return;
  const kind = typeof component._getPanel === "function" ? "panel" : "button";
  items.push({ key, kind, component, element: component.element });
}

/**
 * The titles of the drawer, the small bar above the portrait. Each opens a list, in dnd5e there is one with the
 * saves, skills and tools.
 */
function drawerToggles(hud: any): HTMLElement[] {
  const root: HTMLElement | undefined = hud?.components?.drawer?.element;
  return Array.from(root?.querySelectorAll<HTMLElement>(".ability-toggle .ability-title") ?? []);
}

/** which list of the drawer is open, -1 for none. */
export function openDrawer(hud: any): number {
  return drawerToggles(hud).findIndex((toggle) => toggle.classList.contains("active"));
}

/**
 * Opens the drawer, then its next list when it has several, and closes it after the last one.
 */
export function cycleDrawer(hud: any) {
  const toggles = drawerToggles(hud);
  const open = openDrawer(hud);
  // a click on the title of the open list closes it
  const toggle = toggles[open + 1] ?? toggles[open];
  if (toggle) press(toggle);
}

export function closeDrawer(hud: any) {
  const toggle = drawerToggles(hud)[openDrawer(hud)];
  if (toggle) press(toggle);
}

/**
 * What can be used within a list of the drawer: the cells of its rows that roll something.
 */
export function drawerItems(hud: any, index: number): HudItem[] {
  const items: HudItem[] = [];
  const categories: any[] = hud?.components?.drawer?._categories?.[index]?.categories ?? [];
  categories.forEach((category, categoryIndex) => {
    (category.buttons ?? []).forEach((row: any, rowIndex: number) => {
      (row._buttons ?? []).forEach((cell: any, cellIndex: number) => {
        if (!cell?.onClick) return;
        const element = row.element?.querySelector(`span[data-index="${cellIndex}"]`) as HTMLElement | null;
        if (isVisible(element)) {
          const key = `${index}/${categoryIndex}.${rowIndex}.${cellIndex}`;
          items.push({ key, kind: "button", component: row, element });
        }
      });
    });
  });
  return items;
}

/**
 * Finds the item of a key again, or what is closest to it: an item that is gone leaves the focus to its panel.
 */
export function findItem(items: readonly HudItem[], key: string): HudItem | undefined {
  return items.find((item) => item.key === key) ?? items.find((item) => item.key === key.split("/")[0]);
}

/** the item a panel starts with: its first button, not the title of a category. */
export function firstItem(items: readonly HudItem[]): HudItem | undefined {
  return items.find((item) => item.kind !== "category") ?? items[0];
}

/** keys of the keyboard that are held while the mouse clicks. */
export interface ClickModifiers {
  altKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}

/**
 * A click as the mouse would do it. The components of argon and of the systems built on it listen to mouseup or to
 * click on their element, depending on the kind of button.
 * @param modifiers systems read them from the click, e.g. dnd5e rolls with advantage on an alt-click.
 */
export function press(element: HTMLElement, modifiers: ClickModifiers = {}) {
  const rect = element.getBoundingClientRect();
  const init: MouseEventInit = {
    ...modifiers,
    bubbles: true,
    cancelable: true,
    view: window,
    button: 0,
    clientX: rect.x + rect.width / 2,
    clientY: rect.y + rect.height / 2,
  };
  element.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
  element.dispatchEvent(new MouseEvent("mousedown", { ...init, buttons: 1 }));
  element.dispatchEvent(new PointerEvent("pointerup", init));
  element.dispatchEvent(new MouseEvent("mouseup", init));
  element.dispatchEvent(new MouseEvent("click", init));
}

/**
 * Activates the next or the previous weapon set.
 * @returns false when the hud has no weapon sets.
 */
export function cycleWeaponSet(hud: any, step: number): boolean {
  const root: HTMLElement | undefined = hud?.components?.weaponSets?.element;
  const sets = Array.from(root?.querySelectorAll<HTMLElement>(".weapon-set") ?? []);
  if (sets.length < 2) return false;
  // argon marks the set as active right when it is clicked, before the actor is updated.
  const active = Math.max(
    0,
    sets.findIndex((set) => set.classList.contains("active")),
  );
  const next = sets[(active + step + sets.length) % sets.length];
  press(next.querySelector<HTMLElement>(".set") ?? next);
  return true;
}

/**
 * The focus of a gamepad within the hud: marks the focused item and shows its tooltip.
 */
export class HudFocus {
  // The hud has places that have nothing to do with each other: the action bar with its panels, and the drawer.
  // Each remembers where the focus was.
  private keys: { [scope: string]: string } = {};
  private scope = "bar";
  private item?: HudItem;
  private hudElement?: HTMLElement;
  private lostSince?: number;

  get current(): HudItem | undefined {
    return this.item;
  }

  private get key(): string {
    return this.keys[this.scope] ?? "";
  }

  private set key(key: string) {
    this.keys[this.scope] = key;
  }

  /**
   * Call this whenever the hud may have changed: argon rebuilds its components when it renders.
   * @param items what can be focused right now.
   */
  sync(hud: any, items: readonly HudItem[], color: string, scope: string = "bar") {
    if (scope !== this.scope) {
      this.scope = scope;
      this.lostSince = undefined;
    }
    const hudElement: HTMLElement | undefined = hud?.element;
    if (hudElement !== this.hudElement) {
      this.hudElement?.classList.remove(CONTROL_CLASS);
      this.hudElement = hudElement;
    }
    hudElement?.classList.add(CONTROL_CLASS);
    const found = findItem(items, this.key);
    const item = found ?? firstItem(items);
    if (item?.element !== this.item?.element || !item?.element.classList.contains(FOCUS_CLASS)) {
      this.mark(item, color);
    }
    this.item = item;
    if (found) {
      this.key = found.key;
      this.lostSince = undefined;
    } else if (item) {
      // The focus only stands in for an item that is gone. While argon renders, buttons are missing for a moment,
      // the focus returns to its item when it shows up again in time.
      this.lostSince ??= Date.now();
      if (Date.now() - this.lostSince > LOST_TIMEOUT) {
        this.key = item.key;
        this.lostSince = undefined;
      }
    }
    // tooltips are filled asynchronously, the one of an item the focus already left may show up late
    const tooltip: HTMLElement | undefined = game.tooltip?.element;
    if (item && tooltip && tooltip !== item.element && hudElement?.contains(tooltip)) {
      game.tooltip.deactivate();
      item.element.dispatchEvent(new MouseEvent("mouseenter"));
    }
  }

  set(item: HudItem | undefined, color: string) {
    if (!item) return;
    this.key = item.key;
    this.lostSince = undefined;
    this.mark(item, color);
    this.item = item;
  }

  /** takes the mark away while something else has the gamepad, sync brings it back. */
  pause() {
    this.mark(undefined, "");
  }

  /** takes the mark away for good. The key stays: the focus is found where it was when the hud is used again. */
  clear() {
    this.pause();
    this.hudElement?.classList.remove(CONTROL_CLASS);
    this.hudElement = undefined;
    this.lostSince = undefined;
  }

  private mark(item: HudItem | undefined, color: string) {
    const previous = this.item?.element;
    if (previous) {
      previous.classList.remove(FOCUS_CLASS);
      previous.style.removeProperty(COLOR_VARIABLE);
      // argon and the systems show tooltips and ranges while the mouse is over a button
      previous.dispatchEvent(new MouseEvent("mouseleave"));
      if (game.tooltip?.element === previous) game.tooltip.deactivate();
    }
    this.item = item;
    if (item) {
      item.element.classList.add(FOCUS_CLASS);
      item.element.style.setProperty(COLOR_VARIABLE, color);
      item.element.dispatchEvent(new MouseEvent("mouseenter"));
      // the drawer is a long list that scrolls
      if (this.scope !== "bar") item.element.scrollIntoView({ block: "nearest" });
    }
  }
}
