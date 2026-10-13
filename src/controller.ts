import { buttonName, type Bindings } from "./bindings";
import { readAxis, type Point } from "./core/axes";
import { PressTracker, Repeater } from "./core/input";
import { dominantDirection, nextInDirection } from "./core/spatial";
import { FREE_WALK, HINTS, TURN_OPEN, TURN_RUMBLE, setting } from "./definitions";
import { DialogControl, topDialog } from "./dialogs";
import { HintBar, type Hint } from "./hints";
import { Walker } from "./movement";
import { MovementPlan } from "./planning";
import { getBindings } from "./settings";
import { SheetControl } from "./sheet";
import { TokenMenuControl } from "./tokenMenu";
import {
  centerOn,
  currentToken,
  flipToken,
  ownTokens,
  redoStep,
  switchToken,
  toggleDoorInFront,
  undoStep,
} from "./tokens";
import {
  HudFocus,
  argonHud,
  barItems,
  closeDrawer,
  cycleDrawer,
  cycleWeaponSet,
  drawerItems,
  isHudReady,
  openDrawer,
  openPanelOwner,
  panelItems,
  press,
  rectOf,
  type HudItem,
} from "./argon/hud";
import { PlacementControl, isPlacing } from "./argon/placement";
import {
  TargetCursor,
  ViewControl,
  abortTargetPicker,
  finishTargetPicker,
  isTargetPickerActive,
  type ViewInput,
} from "./argon/targeting";

// How long the hud may take to render. Argon renders again whenever the items of the actor change.
const READY_TIMEOUT = 3000;
// A tick comes every 100ms. Without one for this long the gamepad is gone or the configuration listens to it.
const TICK_TIMEOUT = 300;
// from where on a stick counts as pushed
const STICK_THRESHOLD = 0.5;
// how far the stick has to be pushed with the modifier to start planning a movement
const PLAN_THRESHOLD = 0.3;
// how far the stick has to be pushed to walk the token freely
const GLIDE_THRESHOLD = 0.2;
const FALLBACK_COLOR = "#ff6400";

const DPAD: { [name: string]: Point } = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/**
 * Lets a player fight with the gamepad: moves the token and controls Argon - Combat HUD (enhancedcombathud) and
 * what comes with using it. The token is the one the player has selected, else the token of its character.
 *
 * What a button does depends on what is on the screen, the first line that applies wins:
 *
 * | on the screen             | d-pad, left stick | A              | B                   | X        | Y      | LB        | RB                              | RT, LT          | Back     | Start    |
 * |---------------------------|-------------------|----------------|---------------------|----------|--------|-----------|---------------------------------|-----------------|----------|----------|
 * | 1. a dialog               | field, value      | press, confirm | close dialog        |          |        |           |                                 |                 | let go   |          |
 * | 2. the token menu         | focus             | press          | leave palette, menu | close it |        |           |                                 |                 |          |          |
 * | 2b. the sheet             | tab, entry, coins | expand, use    | collapse, close     | prepare  | coins  |           | + up/down: quantity             |                 |          |          |
 * | 3. an area is placed      | move the area     | place          | cancel              |          |        | turn left | turn right                      |                 |          |          |
 * | 4. argon asks for targets | ring on a token   | target         | cancel              | enough   |        | zoom out  | zoom in                         |                 |          |          |
 * | 5. a movement is planned  | move destination  | walk there     | drop it             |          |        |           |                                 |                 |          |          |
 * | 6. the hud is controlled  | d-pad only: focus | use            | close, hide hud     | menu     | switch | next set  | + d-pad jump, undo. + stick plan | held: alt, ctrl | hide hud | start    |
 * | 7. nothing of that        | walk              |                |                     | menu     | switch | zoom out  | zoom in, + down/up undo         | door, flip      | open hud | start    |
 *
 * The token only walks in line 7, with the stick: the d-pad does not walk it. Line 4 and 5 only come up while the hud
 * is controlled, line 3 whenever an area is placed: it wins over line 2 and 2b. Line 1 and 2 also come up from line 7, the token walks again when they are done. Line 2b comes up
 * from line 7 with up on the d-pad.
 *
 * Line 5 starts in line 6 with the modifier and the left stick: the stick moves a destination freely, not from grid
 * space to grid space, and foundry shows its ruler from the token to there the way it does while a token is dragged
 * with shift. The token does not move before that is confirmed, then it walks there in a straight line.
 *
 * In every line the right stick pans the map and a press on it centers the map on the token. A press on the left
 * stick opens and closes the drawer of the hud with the saves and skills, in line 6 and 7. While the drawer is open
 * the focus moves across what it can roll, B closes it. Start rolls the initiative of the token as long as it has
 * none in the fight, and ends its turn when it is its turn. Both only when the hud of argon shows that token. Y
 * selects the next token of the player, e.g. a summoned creature.
 */
export class Controller {
  bindings: Bindings = getBindings();
  gamepadIndex?: number;
  // something of the lines 1 to 6 is on the screen: the gamepad does not walk the token
  active: boolean = false;
  // The hud of argon is controlled. The gamepad can also be taken for the token menu or a dialog only.
  private controlsHud: boolean = false;

  private presses = new PressTracker();
  private repeater = new Repeater();
  private turning = new Repeater(400, 100);
  private walker = new Walker();
  private plan = new MovementPlan();
  // the direction of this tick comes from the left stick, not from the d-pad
  private steersWithStick: boolean = false;
  private focus = new HudFocus();
  private targets = new TargetCursor();
  private view = new ViewControl();
  private dialogs = new DialogControl();
  private menu = new TokenMenuControl();
  private sheet = new SheetControl();
  private placement = new PlacementControl();
  private hints = new HintBar();
  // the components the hud had before it was asked to show another actor
  private stale?: any;
  private notReadySince?: number;
  // the drawer was asked for while the hud was not shown yet
  private wantsDrawer: boolean = false;
  // The buttons of the weapon sets zoom the map right now: in line 4 and 7 of the table.
  private zooms: boolean = false;
  private lastTick = 0;
  // The button that zooms in also modifies the d-pad. It zooms right away, once it modified something the zoom is
  // put back to what it was when the button went down.
  private jumpScale?: number;
  private jumpUsed: boolean = false;
  private undoing: boolean = false;
  // a dialog the player did not want to answer with the gamepad
  private ignoredDialog?: HTMLElement;
  private myTurn: boolean = false;

  constructor() {
    for (const name of ["updateCombat", "deleteCombat"]) {
      Hooks.on(name, () => this._onCombatChange());
    }
  }

  /** the player changed what the sticks and buttons are used for. */
  public reload() {
    this.bindings = getBindings();
  }

  public tick(gamepad: Gamepad, now: number) {
    this.gamepadIndex = gamepad.index;
    const held = this._held(gamepad);
    const pressed = this.presses.update(held, now);
    if (!held.includes("jump")) {
      this.jumpScale = undefined;
      this.jumpUsed = false;
    } else {
      this.jumpScale ??= canvas.stage?.scale.x;
    }
    const direction = this._direction(gamepad, held, now);
    // the second stick pans the map all the time
    this.lastTick = now;
    this.zooms = false;
    this.view.start(gamepad.index, (pad) => this._viewInput(pad));
    if (pressed.includes("center")) {
      const token = currentToken();
      if (token) centerOn(token);
    }
    if (this.active) {
      this.walker.release();
      this._tickActive(gamepad, pressed, held, direction, now);
    } else {
      this._tickFree(gamepad, pressed, held, direction);
    }
    if (!this.active) this.hints.hide();
  }

  /**
   * line 7 of the table: nothing is open, the stick walks the token.
   */
  private _tickFree(gamepad: Gamepad, pressed: string[], held: string[], direction: Point | undefined) {
    this.zooms = true;
    // a dialog came up, e.g. a save the gamemaster asked for
    const dialog = topDialog();
    if (dialog !== this.ignoredDialog) this.ignoredDialog = undefined;
    if (dialog && dialog !== this.ignoredDialog) {
      this.active = true;
      this.zooms = false;
      this.walker.release();
      return;
    }
    const token = currentToken();
    // an area is placed that was not asked for with the gamepad, e.g. with a click on the sheet
    if (isPlacing() && token) {
      this.active = true;
      this.zooms = false;
      this.walker.release();
      return;
    }
    if (direction) {
      // The d-pad does not walk: with the modifier it takes steps back, up opens the sheet of the token.
      if (held.includes("jump")) {
        if (direction.y !== 0) this._undo(direction.y);
      } else if (token?.actor && direction.y < 0) {
        this.active = true;
        this.zooms = false;
        this.walker.release();
        this.sheet.open(token);
        return;
      }
    }
    // the stick walks the token freely like it pans the map, or from grid space to grid space
    const free = !!setting(FREE_WALK);
    const walk = (pad: Gamepad) => (free ? this._glideDirection(pad) : this._walkDirection(pad));
    if (token && walk(gamepad)) {
      this.walker.hold(
        token,
        () => {
          const pad = navigator.getGamepads()[gamepad.index];
          return pad && !this.active ? walk(pad) : undefined;
        },
        free,
      );
    } else {
      this.walker.release();
    }
    for (const name of pressed) {
      switch (name) {
        case "toggle":
          this._openHud();
          break;
        case "drawer":
          this.wantsDrawer = this._openHud();
          break;
        case "start":
          this._start();
          break;
        case "menu":
          if (token) {
            this.active = true;
            this.menu.open(token);
          }
          break;
        case "switch":
          switchToken();
          break;
        case "advantage":
          if (token) toggleDoorInFront(token).catch(console.error);
          break;
        case "disadvantage":
          if (token) flipToken(token).catch(console.error);
          break;
      }
      // whatever got opened has the gamepad now
      if (this.active) {
        this.zooms = false;
        this.walker.release();
        return;
      }
    }
  }

  /**
   * lines 1 to 6 of the table.
   */
  private _tickActive(gamepad: Gamepad, pressed: string[], held: string[], direction: Point | undefined, now: number) {
    const token = currentToken();
    const color = this._color();

    // 1. a dialog asks something
    if (this.dialogs.sync(color)) {
      this.focus.pause();
      if (direction) {
        const modified = held.includes("jump");
        if (modified) this._modified();
        this.dialogs.move(direction, color, modified, this.steersWithStick);
      }
      if (pressed.includes("ok")) this.dialogs.ok();
      else if (pressed.includes("back")) this.dialogs.back();
      else if (pressed.includes("toggle") && !this.controlsHud) {
        // not a dialog for the gamepad: the player gets the gamepad back, the dialog stays
        this.ignoredDialog = topDialog();
        this._leave();
        return;
      }
      this._hint("dialog", ["stick", "ok", "back", "jump", ...(this.controlsHud ? [] : ["toggle"])], color);
      return;
    }

    // 3. The area of what was used has to be placed on the map. That comes before the token menu and the sheet: an
    // item that is used from the sheet asks for its area while the sheet is still open.
    if (isPlacing() && token) {
      this.focus.pause();
      this.targets.clear();
      this.placement.start(Number(this.gamepadIndex), token.center, (pad) => this._stick(pad));
      // the d-pad moves the area by whole grid spaces, the stick moves it freely
      if (direction && held.some((name) => DPAD[name])) this.placement.nudge(direction);
      // turns once when pressed, then on and on while held
      const turn = held.includes("jump") ? 1 : held.includes("loadout") ? -1 : 0;
      if (this.turning.update(String(turn || ""), now)) this.placement.rotate(turn);
      if (pressed.includes("ok")) this.placement.confirm();
      else if (pressed.includes("back")) this.placement.cancel();
      this._hint("place", ["stick", "ok", "back", "loadout", "jump", "pan"], color);
      return;
    }
    this.placement.stop();

    // 2. the token menu
    if (this.menu.sync(color)) {
      this.focus.pause();
      if (direction) this.menu.move(direction);
      if (pressed.includes("ok")) this.menu.ok();
      else if (pressed.includes("back")) this.menu.back();
      else if (pressed.includes("menu")) this.menu.close();
      this._hint("menu", ["stick", "ok", "back", "menu"], color);
      return;
    }

    // 2b. the sheet of the token
    if (this.sheet.sync(color)) {
      this.focus.pause();
      if (direction) {
        const modified = held.includes("jump");
        if (modified) this._modified();
        this.sheet.move(direction, modified);
      }
      if (pressed.includes("ok")) this.sheet.ok();
      else if (pressed.includes("back")) this.sheet.back();
      else if (pressed.includes("menu")) this.sheet.alter();
      else if (pressed.includes("switch")) this.sheet.toggleCoins();
      this._hint("sheet", ["stick", "ok", "back", "menu", "switch", "jump"], color);
      return;
    }

    // the gamepad was only taken for a dialog, the token menu or the sheet, which is gone
    const hud = argonHud();
    if (!this.controlsHud || !token?.actor || !hud?._actor) {
      // or somebody closed the hud, or the token is gone
      this._leave();
      return;
    }
    // the player selected another token, the hud follows
    if (hud._actor !== token.actor && !this._show()) {
      this._leave();
      return;
    }

    // 4. argon waits for the targets of the item that was used
    if (isTargetPickerActive()) {
      const tint = parseInt(color.replace("#", ""), 16) || 0xffffff;
      this.focus.pause();
      this.targets.sync(token, tint);
      this.zooms = true;
      if (direction) this.targets.move(direction, tint, token);
      if (pressed.includes("ok")) this.targets.toggle();
      else if (pressed.includes("menu")) finishTargetPicker();
      else if (pressed.includes("back")) abortTargetPicker();
      this._hint("target", ["stick", "ok", "menu", "back", "loadout", "jump", "pan"], color);
      return;
    }
    this.targets.clear();

    // 5. a movement is planned for the token
    if (this.plan.active && this.plan.subject !== token) this.plan.cancel();
    if (this.plan.active) {
      this.focus.pause();
      // the stick moves where the token would go freely, the d-pad by a tiny bit
      this.plan.drive(gamepad.index, (pad) => this._stick(pad));
      if (direction && held.some((name) => DPAD[name])) this.plan.nudge(direction);
      if (pressed.includes("ok")) this.plan.confirm().catch(console.error);
      else if (pressed.includes("back")) this.plan.cancel();
      this._hint("plan", ["stick", "ok", "back", "pan"], color);
      return;
    }

    // 6. the hud itself
    if (!this._isReady(hud, token.actor)) {
      // argon is rendering, that takes a moment. Something is wrong when it takes long.
      this.notReadySince ??= now;
      if (now - this.notReadySince > READY_TIMEOUT) this._leave();
      return;
    }
    this.notReadySince = undefined;
    if (this.wantsDrawer) {
      this.wantsDrawer = false;
      if (openDrawer(hud) < 0) cycleDrawer(hud);
    }
    // an open drawer is all that can be focused, then an open panel, then the bar
    const drawer = openDrawer(hud);
    const owner = drawer < 0 ? openPanelOwner(hud) : undefined;
    const items = drawer >= 0 ? drawerItems(hud, drawer) : owner ? panelItems(owner) : barItems(hud);
    this.focus.sync(hud, items, color, drawer >= 0 ? "drawer" : "bar");
    const stick = this._stick(gamepad);
    if (held.includes("jump") && Math.hypot(stick.x, stick.y) > PLAN_THRESHOLD) {
      // the modifier with the stick starts to plan a movement, line 5 goes on from here
      this._modified();
      this.plan.start(token);
      this.plan.drive(gamepad.index, (pad) => this._stick(pad));
      return;
    }
    // The focus of the hud only follows the d-pad. The stick is for the token: with the modifier it plans a movement.
    if (direction && !this.steersWithStick) {
      if (held.includes("jump")) {
        this._modified();
        if (direction.y !== 0) this._undo(direction.y);
        else if (drawer < 0) this._jump(hud, owner, direction.x);
      } else {
        const current = this.focus.current ? items.indexOf(this.focus.current) : -1;
        const rects = items.map((item) => rectOf(item.element));
        this.focus.set(items[nextInDirection(rects, current, direction)], color);
      }
    }
    for (const name of pressed) {
      this._pressInHud(name, hud, token, owner, held, drawer >= 0);
      if (!this.active) return;
    }
    const turn = this._needsInitiative(token) ? ["initiative"] : this._isMyTurn(token) ? ["endTurn"] : [];
    const other = ownTokensCount() > 1 ? ["switch"] : [];
    this._hint(
      "hud",
      [
        "dpad",
        "ok",
        "back",
        "advantage",
        "disadvantage",
        "jump",
        "loadout",
        "menu",
        "drawer",
        ...other,
        ...turn,
        "toggle",
      ],
      color,
    );
  }

  private _pressInHud(
    name: string,
    hud: any,
    token: any,
    owner: HudItem | undefined,
    held: string[],
    inDrawer: boolean,
  ) {
    switch (name) {
      case "ok":
        this._use(this.focus.current, held);
        break;
      case "back":
        if (inDrawer) {
          closeDrawer(hud);
        } else if (owner) {
          // the focus falls back to the button that opened the panel
          owner.component.panel.toggle(false);
        } else {
          // nothing left to go back from: the hud is put away, the gamepad walks the token again
          this._leave();
          hud.toggle(false);
        }
        break;
      case "drawer":
        cycleDrawer(hud);
        break;
      case "loadout":
        cycleWeaponSet(hud, 1);
        break;
      case "menu":
        this.menu.open(token);
        break;
      case "start":
        this._start();
        break;
      case "switch":
        // the hud shows the new token with the next tick
        switchToken();
        break;
      case "toggle":
        this._leave();
        hud.toggle(false);
        break;
    }
  }

  private _use(item: HudItem | undefined, held: string[]) {
    if (!item) return;
    if (item.kind === "panel") {
      // the focus moves into the panel with the next tick: an open panel is all that can be focused.
      item.component.panel?.toggle(true);
    } else if (item.kind === "category") {
      item.component.toggle();
    } else {
      // Systems read the keys of the keyboard from the click: dnd5e rolls with advantage on an alt-click and with
      // disadvantage on a ctrl-click.
      const altKey = held.includes("advantage");
      press(item.element, { altKey, ctrlKey: !altKey && held.includes("disadvantage") });
    }
  }

  /**
   * moves the focus to the next or previous button of the bar that opens a panel: cast spell, use item ... of the
   * action, the bonus action, the reaction.
   * @param step 1 for the next one, -1 for the previous one, they go round in a circle.
   */
  private _jump(hud: any, owner: HudItem | undefined, step: number) {
    if (step === 0) return;
    const bar = barItems(hud);
    const panels = bar.filter((item) => item.kind === "panel");
    if (!panels.length) return;
    // where the focus is within the bar: an open panel counts as its button
    const key = (owner ?? this.focus.current)?.key ?? "";
    const position = bar.findIndex((item) => item.key === key);
    const ahead = panels.filter((item) => bar.indexOf(item) > position);
    const behind = panels.filter((item) => bar.indexOf(item) < position);
    const next = step > 0 ? (ahead[0] ?? panels[0]) : (behind[behind.length - 1] ?? panels[panels.length - 1]);
    owner?.component.panel.toggle(false);
    this.focus.set(next, this._color());
  }

  /**
   * shows the hud for the token and lets the gamepad control it. The focus is where it was left.
   */
  private _openHud(): boolean {
    if (!this._show()) return false;
    this.active = true;
    this.controlsHud = true;
    this.notReadySince = undefined;
    return true;
  }

  /**
   * back to line 7 of the table: the gamepad walks the token again. The hud itself is left as it is.
   */
  private _leave() {
    if (!this.active) return;
    this.active = false;
    this.controlsHud = false;
    this.wantsDrawer = false;
    this.focus.clear();
    this.targets.clear();
    this.plan.cancel();
    this.placement.stop();
    this.dialogs.clear();
    this.menu.close();
    this.sheet.clear();
    this.hints.hide();
  }

  /**
   * What the start button does in a fight, when the hud of argon shows the token: rolls the initiative of the token
   * as long as it has none, ends its turn when it is its turn.
   */
  private _start() {
    const token = currentToken();
    const hud = argonHud();
    if (!token?.actor || !hud?.rendered || hud._actor !== token.actor) return;
    if (this._needsInitiative(token)) {
      const actor = token.actor;
      // dnd5e asks how to roll, foundry itself just rolls
      const roll = actor.rollInitiativeDialog?.() ?? actor.rollInitiative({ createCombatants: true });
      Promise.resolve(roll).catch(console.error);
    } else if (this._isMyTurn(token)) {
      Promise.resolve(game.combat.nextTurn()).catch(console.error);
    }
  }

  /** there is a fight and the token did not roll its initiative yet, it may not even take part so far. */
  private _needsInitiative(token: any | undefined): boolean {
    if (!token?.actor || !game.combat) return false;
    const initiative = (token.document?.combatant ?? token.combatant)?.initiative;
    return initiative === null || initiative === undefined;
  }

  private _isMyTurn(token: any | undefined): boolean {
    const combatant = game.combat?.started ? game.combat.combatant : undefined;
    if (!token?.actor || !combatant) return false;
    return combatant.token?.id === token.id || combatant.actor === token.actor;
  }

  /**
   * the turn of the token starts or ends: the gamepad rumbles, and the hud is opened and left when that is wanted.
   */
  private _onCombatChange() {
    const mine = this._isMyTurn(currentToken());
    if (mine === this.myTurn) return;
    this.myTurn = mine;
    if (mine) {
      if (setting(TURN_RUMBLE)) this._rumble();
      if (setting(TURN_OPEN) && !this.active) this._openHud();
    } else if (setting(TURN_OPEN) && this.controlsHud) {
      this._leave();
    }
  }

  private _rumble() {
    const gamepad: any = navigator.getGamepads()[Number(this.gamepadIndex)];
    gamepad?.vibrationActuator
      ?.playEffect("dual-rumble", { duration: 400, strongMagnitude: 0.8, weakMagnitude: 0.8 })
      ?.catch(() => undefined);
  }

  /**
   * takes back the last step of the token, or does it again.
   * @param direction -1, up, takes back. 1, down, does again.
   */
  private _undo(direction: number) {
    this._modified();
    const token = currentToken();
    if (!token || this.undoing) return;
    this.undoing = true;
    (direction > 0 ? undoStep(token) : redoStep(token)).catch(console.error).finally(() => (this.undoing = false));
  }

  /**
   * shows what the buttons do right now.
   * @param names buttons of the bindings, "stick" for d-pad and left stick, "dpad" for the d-pad alone, "pan" for
   * the right stick.
   */
  private _hint(layer: string, names: string[], color: string) {
    if (!setting(HINTS)) {
      this.hints.hide();
      return;
    }
    // what a hint is about, when it is not the button of the same name
    const buttons: { [name: string]: string } = { initiative: "start", endTurn: "start" };
    const hints: Hint[] = names.map((name) => {
      const own = `combatController.hints.${layer}.${name}`;
      const index = this.bindings.buttons[buttons[name] ?? name]?.index;
      return {
        button: { stick: "L", pan: "R", dpad: "D-pad" }[name] ?? buttonName(index),
        text: game.i18n.localize(game.i18n.has(own) ? own : `combatController.hints.${name}`),
      };
    });
    this.hints.show(hints, color);
  }

  /**
   * makes sure that the hud shows the token.
   * @returns false when there is no token it could be shown for.
   */
  private _show(): boolean {
    const hud = argonHud();
    if (!hud) return false;
    const token = currentToken();
    if (!token?.actor) {
      ui.notifications.warn("combatController.noToken", { localize: true });
      return false;
    }
    // states above 0 are rendering and rendered
    if (hud._actor !== token.actor || !(hud.state > 0)) {
      this.stale = hud.components;
      hud.bind(token);
    }
    return true;
  }

  private _isReady(hud: any, actor: any): boolean {
    if (hud?.components === this.stale || !isHudReady(hud, actor)) return false;
    this.stale = undefined;
    return true;
  }

  /**
   * the button that zooms in was used to modify the d-pad: it was not meant to zoom.
   */
  private _modified() {
    if (!this.jumpUsed && this.zooms && this.jumpScale !== undefined && canvas.stage.scale.x !== this.jumpScale) {
      canvas.pan({ scale: this.jumpScale });
    }
    this.jumpUsed = true;
  }

  private _color(): string {
    return String(game.user.color ?? FALLBACK_COLOR);
  }

  private _held(gamepad: Gamepad): string[] {
    return Object.entries(this.bindings.buttons)
      .filter(([, button]) => gamepad.buttons[button.index]?.pressed)
      .map(([name]) => name);
  }

  /** 1 while the button that zooms in is down, -1 for the one that zooms out. */
  private _zoom(gamepad: Gamepad): number {
    const buttons = this.bindings.buttons;
    const isDown = (name: string) => (gamepad.buttons[buttons[name]?.index]?.pressed ? 1 : 0);
    // not before a tick saw the button and noted the zoom to go back to
    const zoomsIn = !this.jumpUsed && this.jumpScale !== undefined;
    return (zoomsIn ? isDown("jump") : 0) - isDown("loadout");
  }

  /** where the left stick points to. */
  private _stick(gamepad: Gamepad): Point {
    return {
      x: readAxis(this.bindings.axes["move-horizontal"], gamepad.axes),
      y: readAxis(this.bindings.axes["move-vertical"], gamepad.axes),
    };
  }

  /** the direction the left stick walks the token to, it can walk diagonal. Undefined while the stick rests. */
  private _walkDirection(gamepad: Gamepad): Point | undefined {
    const stick = this._stick(gamepad);
    const direction = {
      x: Math.abs(stick.x) > STICK_THRESHOLD ? Math.sign(stick.x) : 0,
      y: Math.abs(stick.y) > STICK_THRESHOLD ? Math.sign(stick.y) : 0,
    };
    return direction.x === 0 && direction.y === 0 ? undefined : direction;
  }

  /** where the left stick walks the token to freely, the further it is pushed the faster. Undefined while it rests. */
  private _glideDirection(gamepad: Gamepad): Point | undefined {
    const stick = this._stick(gamepad);
    return Math.hypot(stick.x, stick.y) > GLIDE_THRESHOLD ? stick : undefined;
  }

  /**
   * what the second stick and the zoom buttons ask the map to do at this moment.
   */
  private _viewInput(gamepad: Gamepad): ViewInput {
    // no ticks: the gamepad is not ours right now
    if (Date.now() - this.lastTick > TICK_TIMEOUT) {
      return { pan: { x: 0, y: 0 }, zoom: 0 };
    }
    return {
      pan: {
        x: readAxis(this.bindings.axes["pan-horizontal"], gamepad.axes),
        y: readAxis(this.bindings.axes["pan-vertical"], gamepad.axes),
      },
      zoom: this.zooms ? this._zoom(gamepad) : 0,
    };
  }

  /**
   * One step into a direction, when it is time for one: once when the d-pad is pressed, then on and on while it is
   * held. In the lines 1 to 6 the left stick does the same, steersWithStick tells which of the two it was.
   */
  private _direction(gamepad: Gamepad, held: string[], now: number): Point | undefined {
    const point = { x: 0, y: 0 };
    for (const name of held) {
      point.x += DPAD[name]?.x ?? 0;
      point.y += DPAD[name]?.y ?? 0;
    }
    this.steersWithStick = false;
    if (this.active && point.x === 0 && point.y === 0) {
      Object.assign(point, this._stick(gamepad));
      this.steersWithStick = true;
    }
    const direction = dominantDirection(point, STICK_THRESHOLD);
    const key = direction ? `${direction.x},${direction.y}` : "";
    return this.repeater.update(key, now) ? direction : undefined;
  }
}

function ownTokensCount(): number {
  return ownTokens().length;
}
