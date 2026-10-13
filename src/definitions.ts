export const ID = "combat-controller" as const;
export const ARGON_ID = "enhancedcombathud";

// settings, all stored in the browser: they describe the gamepad and the taste of the player at this screen
export const BINDINGS = "bindings";
export const HINTS = "hints";
export const TURN_RUMBLE = "turn_rumble";
export const TURN_OPEN = "turn_open";
export const TOKEN_SPEED = "token_speed";
export const FREE_WALK = "free_walk";

export const setting = (key: string): any => game.settings.get(ID, key);
