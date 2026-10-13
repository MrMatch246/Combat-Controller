import { DEFAULT_BINDINGS, buttonName, withStored, type Bindings } from "../bindings";
import { CaptureSession, isNeutral, snapshot, type CaptureKind, type PadSnapshot } from "../core/capture";
import { BINDINGS, ID } from "../definitions";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// how long a detection waits for the player
const DETECT_TIMEOUT = 8000;

interface Listening {
  kind: CaptureKind;
  name: string;
  // one session per gamepad: whichever gamepad the player uses is the one that counts
  sessions: Map<number, { baseline: PadSnapshot; session: CaptureSession }>;
  // the binding is found, the stick or button has to be let go before the gamepad is given back
  found?: number;
  since: number;
}

/**
 * Lets the player say which stick and button of the gamepad is used for what, by using them.
 */
export class BindingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  // set by the module: stops the controller while this listens to the gamepad, and tells it about changes
  static onListening: (listening: boolean) => void = () => undefined;
  static onChange: () => void = () => undefined;

  private listening?: Listening;
  private timer?: number;

  static DEFAULT_OPTIONS = {
    id: `${ID}-bindings`,
    classes: [ID, "combat-controller-bindings"],
    tag: "div",
    window: { title: "combatController.bindingsApp.title", icon: "fa-solid fa-gamepad" },
    position: { width: 520, height: 640 },
    actions: {
      detect: BindingsApp.onDetect,
      reset: BindingsApp.onReset,
    },
  };

  static PARTS = {
    content: { template: `modules/${ID}/templates/bindings.hbs`, scrollable: [""] },
  };

  private get bindings(): Bindings {
    return withStored(game.settings.get(ID, BINDINGS));
  }

  async _prepareContext(): Promise<any> {
    const bindings = this.bindings;
    const row = (kind: CaptureKind, name: string, data: any) => ({
      kind,
      name,
      label: game.i18n.localize(`combatController.bindings.${name}`),
      index: data.index,
      isAxis: kind === "axes",
      reversed: !!data.reversed,
      // what the button is called on a standard gamepad
      standard: kind === "buttons" ? buttonName(data.index) : "",
      listening: this.listening?.kind === kind && this.listening.name === name,
    });
    return {
      prompt: this.listening
        ? game.i18n.localize(
            this.listening.found !== undefined
              ? "combatController.bindingsApp.release"
              : `combatController.bindingsApp.${this.listening.kind === "buttons" ? "pressButton" : /horizontal/.test(this.listening.name) ? "pushRight" : "pushDown"}`,
          )
        : undefined,
      rows: [
        ...Object.entries(bindings.axes).map(([name, data]) => row("axes", name, data)),
        ...Object.entries(bindings.buttons).map(([name, data]) => row("buttons", name, data)),
      ],
    };
  }

  async _onRender(context: any, options: any) {
    await super._onRender(context, options);
    this.element.querySelectorAll("input").forEach((input: HTMLInputElement) => {
      input.addEventListener("change", () => this.store(input));
    });
  }

  async close(options?: any): Promise<any> {
    this.stopListening();
    return super.close(options);
  }

  /** a number or a checkbox was changed by hand. */
  private async store(input: HTMLInputElement) {
    const { kind, name } = input.dataset as { kind: CaptureKind; name: string };
    const bindings = this.bindings;
    const binding: any = bindings[kind][name];
    if (!binding) return;
    if (input.type === "checkbox") binding.reversed = input.checked;
    else if (Number.isInteger(Number(input.value)) && Number(input.value) >= 0) binding.index = Number(input.value);
    await this.save(bindings);
  }

  private async save(bindings: Bindings | {}) {
    await game.settings.set(ID, BINDINGS, bindings);
    BindingsApp.onChange();
    this.render();
  }

  static async onReset(this: BindingsApp) {
    this.stopListening();
    await this.save({});
  }

  /** waits for the player to use the stick or button that should be bound. */
  static onDetect(this: BindingsApp, _event: Event, target: HTMLElement) {
    this.stopListening();
    const { kind, name } = target.dataset as { kind: CaptureKind; name: string };
    if (!DEFAULT_BINDINGS[kind]?.[name]) return;
    this.listening = { kind, name, sessions: new Map(), since: Date.now() };
    BindingsApp.onListening(true);
    this.timer = window.setInterval(() => this.listen().catch(console.error), 30);
    this.render();
  }

  private async listen() {
    const listening = this.listening;
    if (!listening) return;
    const pads = navigator.getGamepads().filter((pad): pad is Gamepad => !!pad);
    if (listening.found !== undefined) {
      const pad = pads.find((candidate) => candidate.index === listening.found);
      const baseline = listening.sessions.get(listening.found)?.baseline;
      if (!pad || !baseline || isNeutral(baseline, snapshot(pad))) this.stopListening();
      return;
    }
    if (Date.now() - listening.since > DETECT_TIMEOUT) {
      ui.notifications.warn("combatController.bindingsApp.timeout", { localize: true });
      this.stopListening();
      return;
    }
    for (const pad of pads) {
      const current = snapshot(pad);
      let entry = listening.sessions.get(pad.index);
      if (!entry) {
        entry = { baseline: current, session: new CaptureSession(listening.kind, current) };
        listening.sessions.set(pad.index, entry);
      }
      const result = entry.session.update(current);
      if (!result) continue;
      listening.found = pad.index;
      const bindings = this.bindings;
      const binding: any = bindings[listening.kind][listening.name];
      binding.index = result.index;
      if (result.kind === "axes") binding.reversed = result.reversed;
      await this.save(bindings);
      return;
    }
  }

  private stopListening() {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    if (this.listening) {
      this.listening = undefined;
      BindingsApp.onListening(false);
      if (this.rendered) this.render();
    }
  }
}
