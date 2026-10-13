import { BindingsApp } from "./apps/BindingsApp";
import { withStored, type Bindings } from "./bindings";
import { BINDINGS, FREE_WALK, HINTS, ID, TOKEN_SPEED, TURN_OPEN, TURN_RUMBLE } from "./definitions";

export function registerSettings() {
  game.settings.register(ID, BINDINGS, {
    scope: "client",
    config: false,
    default: {},
    type: Object,
  });

  game.settings.registerMenu(ID, "bindingsMenu", {
    icon: "fa-solid fa-gamepad",
    name: "combatController.settings.bindings.name",
    label: "combatController.settings.bindings.label",
    hint: "combatController.settings.bindings.hint",
    type: BindingsApp,
    restricted: false,
  });

  for (const [key, initial] of [
    [HINTS, true],
    [TURN_RUMBLE, true],
    [TURN_OPEN, false],
    [FREE_WALK, true],
  ] as const) {
    game.settings.register(ID, key, {
      name: `combatController.settings.${key}.name`,
      hint: `combatController.settings.${key}.hint`,
      scope: "client",
      config: true,
      type: Boolean,
      default: initial,
    });
  }

  game.settings.register(ID, TOKEN_SPEED, {
    name: `combatController.settings.${TOKEN_SPEED}.name`,
    hint: `combatController.settings.${TOKEN_SPEED}.hint`,
    scope: "client",
    config: true,
    type: Number,
    default: 4,
    range: { min: 1, max: 12, step: 0.5 },
  });
}

export function getBindings(): Bindings {
  return withStored(game.settings.get(ID, BINDINGS));
}

export function setBindings(bindings: Bindings | {}): Promise<any> {
  return game.settings.set(ID, BINDINGS, bindings);
}
