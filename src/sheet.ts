// The sheet of the actor of a token. This opens it without a mouse, switches between its tabs and moves a focus
// across the entries of the tab that is shown: the items, spells, features and effects. An entry can be expanded,
// what it can be used for is then listed below it and can be used. Spells are prepared, items equipped and counted,
// and the coins of the actor changed. It knows the sheet of dnd5e and the one of Tidy 5e Sheets.

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

// the fields with the coins of the actor, in both sheets
const COIN_SELECTOR = 'input[name^="system.currency."], input[data-name^="system.currency."]';
// the entry of an item, not the one of something the item can be used for
const ITEM_SELECTOR = "[data-item-id]:not([data-activity-id])";

// Tidy 5e Sheets renders its own sheet with names of its own.
const TIDY: SheetLayout = {
  tabs: ['.tidy-tabs [role="tab"][data-tab-id]'],
  nested: ".tidy-tab",
  content: (tab) => `.tidy-tab[data-tab-contents-for="${tab}"]`,
  entries: [
    ".tidy-table-row[data-tidy-table-row]",
    ".tidy-vertical-tabs li.vertical-tab",
    '[data-action="roll"], .rollable',
  ],
  toggle: "a.item-name",
  isExpanded: (entry) => entry.classList.contains("expanded"),
};
// the sheet of dnd5e, and what is built like the sheets of foundry usually are
const DEFAULT: SheetLayout = {
  tabs: ['nav.tabs[data-group="primary"] [data-tab]', "nav.tabs [data-tab]", "nav.sheet-tabs [data-tab]"],
  content: (tab) => `.tab[data-tab="${tab}"]`,
  entries: ["li.item, li.activity-row", 'li.condition, [data-action="roll"], .rollable'],
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
  // the focus is on the coins of the actor, on this one
  private coin?: number;
  // the actor is being changed, the next change has to wait for what comes of it
  private busy = false;
  private mark = new FocusMark();

  open(token: any) {
    const app = token.actor?.sheet;
    if (!app) return;
    this.app = app;
    this.index = 0;
    this.tab = undefined;
    this.coin = undefined;
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
      this.coin = undefined;
    }
    if (this.coin !== undefined) {
      const coins = this.coins();
      if (coins.length) {
        this.coin = Math.min(this.coin, coins.length - 1);
        this.focus(coins[this.coin].closest<HTMLElement>("label") ?? coins[this.coin], color);
        return true;
      }
      this.coin = undefined;
    }
    const entries = this.entries();
    this.index = Math.min(this.index, Math.max(0, entries.length - 1));
    this.focus(entries[this.index], color);
    return true;
  }

  /**
   * Left and right switch between the tabs, up and down move across the entries of the tab. While the focus is on
   * the coins of the actor left and right go from coin to coin, up and down change how many there are.
   * @param modified the modifier is held: up and down change the quantity of the focused item, and the coins by 10.
   */
  move(direction: Point, modified = false) {
    if (!this.root) return;
    if (this.coin !== undefined) {
      const coins = this.coins();
      if (direction.x !== 0) this.coin = Math.min(Math.max(this.coin + direction.x, 0), Math.max(0, coins.length - 1));
      else this.pay(coins[this.coin], -direction.y * (modified ? 10 : 1));
    } else if (direction.x !== 0) {
      const tabs = this.tabs();
      if (!tabs.length) return;
      const current = Math.max(0, tabs.indexOf(this.activeTab() as HTMLElement));
      tabs[(current + direction.x + tabs.length) % tabs.length].click();
    } else if (modified) {
      this.count(-direction.y);
    } else {
      const count = this.entries().length;
      this.index = Math.min(Math.max(this.index + direction.y, 0), Math.max(0, count - 1));
    }
  }

  /**
   * Puts the focus on the coins of the actor, or back on the entries. Scrolling through the entries never gets to
   * the coins, so they are not changed by accident. Does nothing on a tab without coins.
   */
  toggleCoins() {
    if (this.coin !== undefined) this.coin = undefined;
    else if (this.coins().length) this.coin = 0;
  }

  /**
   * Expands the focused entry or collapses it again. What an expanded item can be used for is used. An entry that
   * can not be expanded is pressed: a skill is rolled.
   */
  ok() {
    const entry = this.mark.element;
    if (!entry?.isConnected || this.coin !== undefined) return;
    const activity = this.activityOf(entry);
    if (activity) {
      Promise.resolve(activity.use()).catch(console.error);
      return;
    }
    (entry.querySelector<HTMLElement>(this.layout.toggle) ?? entry).click();
  }

  /** leaves the coins, else collapses the focused entry, else closes the sheet. */
  back() {
    if (this.coin !== undefined) {
      this.coin = undefined;
      return;
    }
    const entry = this.mark.element;
    if (!entry?.isConnected) return this.close();
    // from what an item can be used for back to the item
    const owner = this.ownerOf(entry);
    const item = owner ?? entry;
    const toggle = item.querySelector<HTMLElement>(this.layout.toggle);
    if (toggle && this.layout.isExpanded(item)) {
      if (owner) this.index = Math.max(0, this.entries().indexOf(owner));
      toggle.click();
    } else {
      this.close();
    }
  }

  /** prepares the focused spell or lets go of it, puts the focused item on or off. */
  alter() {
    const entry = this.mark.element;
    if (!entry?.isConnected || this.coin !== undefined || this.activityOf(entry)) return;
    const item = this.itemOf(entry);
    if (!item) return;
    if (item.type === "spell") {
      const prepared = Number(item.system.prepared) || 0;
      const always = CONFIG.DND5E?.spellPreparationStates?.always?.value ?? 2;
      // a spell that is always prepared stays so, a cantrip is not prepared at all
      if (prepared === always || item.system.canPrepare === false) return;
      this.change(item, { "system.prepared": Number(!prepared) });
    } else if (typeof item.system?.equipped === "boolean") {
      this.change(item, { "system.equipped": !item.system.equipped });
    }
  }

  /** one more or one less of the focused item. */
  private count(delta: number) {
    const entry = this.mark.element;
    if (!entry?.isConnected || this.activityOf(entry)) return;
    const item = this.itemOf(entry);
    const quantity = item?.system?.quantity;
    if (typeof quantity !== "number") return;
    this.change(item, { "system.quantity": Math.max(0, quantity + delta) });
  }

  /** more or less of a coin of the actor. */
  private pay(coin: HTMLInputElement | undefined, delta: number) {
    const actor = this.actor;
    const key = (coin?.name || coin?.dataset.name)?.split(".").pop();
    const value = key ? actor?.system?.currency?.[key] : undefined;
    if (typeof value !== "number") return;
    this.change(actor, { [`system.currency.${key}`]: Math.max(0, value + delta) });
  }

  private change(document: any, data: object) {
    if (this.busy) return;
    this.busy = true;
    Promise.resolve(document.update(data))
      .catch(console.error)
      .finally(() => (this.busy = false));
  }

  private get actor(): any | undefined {
    return this.app?.actor ?? this.app?.document;
  }

  /** the item of an entry, also for what the item can be used for. */
  private itemOf(entry: HTMLElement): any | undefined {
    const id = entry.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    return id ? this.actor?.items?.get(id) : undefined;
  }

  /** what the entry uses an item for, undefined for the entry of an item itself. */
  private activityOf(entry: HTMLElement): any | undefined {
    const id = entry.dataset.activityId;
    return id ? this.itemOf(entry)?.system?.activities?.get(id) : undefined;
  }

  /** the entry of the item that an entry belongs to, undefined for the entry of an item itself. */
  private ownerOf(entry: HTMLElement): HTMLElement | undefined {
    if (!entry.dataset.activityId) return undefined;
    const item = entry.parentElement?.closest<HTMLElement>(ITEM_SELECTOR);
    if (!item) return undefined;
    return item.querySelector<HTMLElement>(":scope > .tidy-table-row") ?? item;
  }

  private get root(): HTMLElement | undefined {
    const element = this.app?.element;
    // Sheets of the older kind hand out jquery. A sheet that is a form must not be asked for its first entry, that
    // would be its first field.
    return element instanceof HTMLElement ? element : (element?.[0] ?? undefined);
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
      // what an item can be used for only counts while the item is expanded
      const entries = visible(shown.querySelectorAll<HTMLElement>(selector)).filter((entry) => {
        const owner = this.ownerOf(entry);
        return !owner || this.layout.isExpanded(owner);
      });
      if (entries.length) return entries;
    }
    return [];
  }

  /** the fields with the coins of the actor in the tab that is shown, each coin once. */
  private coins(): HTMLInputElement[] {
    const root = this.root;
    if (!root) return [];
    const tab = this.activeTabId();
    const shown = (tab ? root.querySelector<HTMLElement>(this.layout.content(tab)) : null) ?? root;
    const coins = new Map<string, HTMLInputElement>();
    // an open container lists its own coins further up, the ones of the actor come last
    for (const coin of visible(shown.querySelectorAll<HTMLInputElement>(COIN_SELECTOR))) {
      coins.set(coin.name || coin.dataset.name || "", coin);
    }
    return Array.from(coins.values());
  }

  private focus(entry: HTMLElement | undefined, color: string) {
    if (entry === this.mark.element && entry?.classList.contains("combat-controller-focus") !== false) return;
    this.mark.set(entry, color);
    entry?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

function visible<T extends HTMLElement>(elements: NodeListOf<T>): T[] {
  return Array.from(elements).filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}
