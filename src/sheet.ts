// The sheet of the actor of a token. This opens it without a mouse, switches between its tabs and moves a focus
// across the entries of the tab that is shown: the items, spells, features and effects. It knows the sheet of dnd5e
// and the one of Tidy 5e Sheets.

import type { Point } from "./core/axes";
import { FocusMark } from "./focus";

/** how a kind of sheet is built: where its tabs are, what they list and how an entry is expanded. */
interface SheetLayout {
  // the tabs of the sheet itself, the first of these that the sheet has
  tabs: string[];
  // tabs that are found within this belong to something in a tab, not to the sheet
  nested?: string;
  // what the tab with this id shows
  content: (tab: string) => string;
  // What a tab lists, the first of these that the tab has. A tab without a list, like the one with the skills, has
  // what can be rolled.
  entries: string[];
  // what expands and collapses an entry when it is clicked
  toggle: string;
  isExpanded: (entry: HTMLElement) => boolean;
}

// Tidy 5e Sheets renders its own sheet with names of its own.
const TIDY: SheetLayout = {
  tabs: ['.tidy-tabs [role="tab"][data-tab-id]'],
  nested: ".tidy-tab",
  content: (tab) => `.tidy-tab[data-tab-contents-for="${tab}"]`,
  entries: [".tidy-table-row[data-tidy-table-row]", '[data-action="roll"], .rollable'],
  toggle: "a.item-name",
  isExpanded: (entry) => entry.classList.contains("expanded"),
};
// the sheet of dnd5e, and what is built like the sheets of foundry usually are
const DEFAULT: SheetLayout = {
  tabs: ['nav.tabs[data-group="primary"] [data-tab]', "nav.tabs [data-tab]", "nav.sheet-tabs [data-tab]"],
  content: (tab) => `.tab[data-tab="${tab}"]`,
  entries: ["li.item", 'li.condition, [data-action="roll"], .rollable'],
  toggle: '[data-action="toggleExpand"]',
  isExpanded: (entry) => entry.classList.contains("collapsible") && !entry.classList.contains("collapsed"),
};

/**
 * The focus of a gamepad within the sheet of one actor.
 */
export class SheetControl {
  private app?: any;
  private opening = false;
  private index = 0;
  private tab?: string;
  private mark = new FocusMark();

  open(token: any) {
    const app = token.actor?.sheet;
    if (!app) return;
    this.app = app;
    this.index = 0;
    this.tab = undefined;
    this.opening = true;
    Promise.resolve(app.render(true))
      .catch(console.error)
      .finally(() => (this.opening = false));
  }

  close() {
    const app = this.app;
    this.clear();
    if (app?.rendered) app.close();
  }

  /** forgets the sheet, it stays open when it is. */
  clear() {
    this.mark.clear();
    this.app = undefined;
    this.opening = false;
  }

  /**
   * Call this on every tick: the sheet renders again whenever the actor changes, and the player may close it.
   * @returns true while the sheet this control opened is open, the gamepad then belongs to that sheet.
   */
  sync(color: string): boolean {
    if (!this.app) return false;
    if (this.opening) return true;
    if (!this.app.rendered || !this.root) {
      this.clear();
      return false;
    }
    // another tab starts at its first entry
    const tab = this.activeTabId();
    if (tab !== this.tab) {
      this.tab = tab;
      this.index = 0;
    }
    const entries = this.entries();
    this.index = Math.min(this.index, Math.max(0, entries.length - 1));
    this.focus(entries[this.index], color);
    return true;
  }

  /** left and right switch between the tabs, up and down move across the entries of the tab. */
  move(direction: Point) {
    if (!this.root) return;
    if (direction.x !== 0) {
      const tabs = this.tabs();
      if (!tabs.length) return;
      const current = Math.max(0, tabs.indexOf(this.activeTab() as HTMLElement));
      tabs[(current + direction.x + tabs.length) % tabs.length].click();
    } else {
      const count = this.entries().length;
      this.index = Math.min(Math.max(this.index + direction.y, 0), Math.max(0, count - 1));
    }
  }

  /** expands the focused entry. An entry that can not be expanded is pressed: a skill is rolled. */
  ok() {
    const entry = this.mark.element;
    if (!entry?.isConnected) return;
    const toggle = entry.querySelector<HTMLElement>(this.layout.toggle);
    if (!toggle) entry.click();
    else if (!this.layout.isExpanded(entry)) toggle.click();
  }

  /** collapses the focused entry, closes the sheet when it is not expanded. */
  back() {
    const entry = this.mark.element;
    const toggle = entry?.isConnected ? entry.querySelector<HTMLElement>(this.layout.toggle) : null;
    if (entry && toggle && this.layout.isExpanded(entry)) toggle.click();
    else this.close();
  }

  private get root(): HTMLElement | undefined {
    const element = this.app?.element;
    // sheets of the older kind hand out jquery
    return (element?.[0] ?? element) || undefined;
  }

  private get layout(): SheetLayout {
    return this.root?.querySelector(TIDY.tabs[0]) ? TIDY : DEFAULT;
  }

  private tabs(): HTMLElement[] {
    const root = this.root;
    if (!root) return [];
    const { nested } = this.layout;
    for (const selector of this.layout.tabs) {
      const tabs = visible(root.querySelectorAll<HTMLElement>(selector)).filter(
        (tab) => !nested || !tab.closest(nested),
      );
      if (tabs.length) return tabs;
    }
    return [];
  }

  private activeTab(): HTMLElement | undefined {
    return this.tabs().find((tab) => tab.classList.contains("active"));
  }

  private activeTabId(): string | undefined {
    const tab = this.activeTab();
    return tab?.dataset.tab ?? tab?.dataset.tabId;
  }

  private entries(): HTMLElement[] {
    const root = this.root;
    if (!root) return [];
    const tab = this.activeTabId();
    const shown = (tab ? root.querySelector<HTMLElement>(this.layout.content(tab)) : null) ?? root;
    for (const selector of this.layout.entries) {
      const entries = visible(shown.querySelectorAll<HTMLElement>(selector));
      if (entries.length) return entries;
    }
    return [];
  }

  private focus(entry: HTMLElement | undefined, color: string) {
    if (entry === this.mark.element && entry?.classList.contains("combat-controller-focus") !== false) return;
    this.mark.set(entry, color);
    entry?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

function visible(elements: NodeListOf<HTMLElement>): HTMLElement[] {
  return Array.from(elements).filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}
