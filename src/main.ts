import { BindingsApp } from "./apps/BindingsApp";
import { Controller } from "./controller";
import { ARGON_ID, ID } from "./definitions";
import { Gamepads } from "./gamepads";
import { registerSettings } from "./settings";

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", () => {
  if (!game.modules.get(ARGON_ID)?.active) {
    console.warn(`${ID} | Argon - Combat HUD is not active, the gamepad stays off.`);
    return;
  }
  const controller = new Controller();
  const gamepads = new Gamepads((gamepad, now) => controller.tick(gamepad, now));
  // while the player tells which button is which, the buttons must not do anything
  BindingsApp.onListening = (listening) => (gamepads.suspended = listening);
  BindingsApp.onChange = () => controller.reload();
  game.modules.get(ID).api = { controller, gamepads };
});
