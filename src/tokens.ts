// The token the gamepad drives, and what it can do with it apart from walking.

import { doorsInFront, stepBack } from "./core/door";

interface Position {
  x: number;
  y: number;
}

/**
 * The token the gamepad drives: the one the player has selected, else the token of the character of the player.
 */
export function currentToken(): any | undefined {
  if (!canvas?.ready) return undefined;
  const controlled = canvas.tokens.controlled[0];
  if (controlled?.actor?.isOwner) return controlled;
  const character = game.user.character;
  if (!character) return undefined;
  return canvas.tokens.placeables.find((token: any) => token.actor?.uuid === character.uuid);
}

/**
 * The tokens on the scene the player can switch between: its character first, then what else belongs to the
 * player, like a familiar, and what those summoned.
 */
export function ownTokens(): any[] {
  if (!canvas?.ready) return [];
  const character = game.user.character;
  const level = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const tokens: any[] = canvas.tokens.placeables.filter((token: any) => token.actor?.isOwner);
  // A gamemaster owns everything. What counts for it is what was given to it by name, like for a player.
  const named = tokens.filter(
    (token) => token.actor.uuid === character?.uuid || (token.actor.ownership?.[game.user.id] ?? 0) >= level,
  );
  // What one of those summoned belongs to the player as well, whoever owns the actor that was summoned: dnd5e
  // notes the item that summoned it.
  const summoned = tokens.filter((token) => {
    const origin = token.actor.flags?.dnd5e?.summon?.origin;
    return (
      typeof origin === "string" &&
      !named.includes(token) &&
      named.some((owner) => origin.startsWith(`${owner.actor.uuid}.`))
    );
  });
  named.push(...summoned);
  const list = named.length ? named : game.user.isGM ? [] : tokens;
  const rank = (token: any) => (token.actor.uuid === character?.uuid ? 0 : 1);
  return list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/**
 * Selects the next token of the player, the gamepad drives that one from now on.
 * @returns the token that is selected now.
 */
export function switchToken(): any | undefined {
  const tokens = ownTokens();
  if (!tokens.length) return undefined;
  const current = currentToken();
  const next = tokens[(tokens.indexOf(current) + 1) % tokens.length];
  next.control({ releaseOthers: true });
  bringIntoView(next);
  return next;
}

/** moves the map so the token is in the middle of the screen. */
export function centerOn(token: any) {
  canvas.animatePan({ x: token.center.x, y: token.center.y, duration: 250 });
}

/** pans the map to a token that is not on the screen. */
export function bringIntoView(token: any, margin = 60) {
  const point = canvas.stage.worldTransform.apply(token.center);
  const inView =
    point.x > margin &&
    point.y > margin &&
    point.x < window.innerWidth - margin &&
    point.y < window.innerHeight - margin;
  if (!inView) centerOn(token);
}

/**
 * Opens or closes the closest door in front of the token. Locked doors stay locked, secret doors stay secret.
 */
export async function toggleDoorInFront(token: any): Promise<void> {
  const { OPEN, CLOSED } = CONST.WALL_DOOR_STATES;
  const doors = canvas.walls.placeables
    .map((wall: any) => wall.document)
    .filter((wall: any) => wall.door === CONST.WALL_DOOR_TYPES.DOOR && [OPEN, CLOSED].includes(wall.ds))
    .map((wall: any) => ({ door: wall, c: wall.c }));
  const center = token.getCenterPoint();
  // a token that does not rotate has no front
  const arc = token.document.lockRotation ? 360 : 120;
  const candidates = doorsInFront<any>(center, token.document.rotation ?? 0, doors, canvas.grid.size * 1.5, arc);
  // no door behind a wall
  const candidate = candidates.find(({ point }) => !token.checkCollision(stepBack(center, point, 5)));
  if (!candidate) return;
  await candidate.door.update({ ds: candidate.door.ds === CLOSED ? OPEN : CLOSED });
}

/** mirrors the image of the token, so it looks to the other side. */
export async function flipToken(token: any): Promise<void> {
  await token.document.update({ "texture.scaleX": -(token.document.texture?.scaleX ?? 1) });
}

// what the gamepad did with a token, per token id: where it came from step by step, and what was taken back
const steps = new Map<string, Position[]>();
const undone = new Map<string, Position[]>();
const MAX_STEPS = 100;

/**
 * Remembers a step the gamepad made with a token, so it can be taken back.
 * @param from where the token stood before the step.
 */
export function noteStep(token: any, from: Position) {
  const list = steps.get(token.id) ?? [];
  list.push({ x: from.x, y: from.y });
  steps.set(token.id, list.slice(-MAX_STEPS));
  // a new step ends what could be done again
  undone.delete(token.id);
}

// The free walks of a token in a fight: foundry records every piece of one as a movement of its own.
const glides = new Map<string, { first: string; last: string }[]>();

/**
 * Remembers a piece of a free walk, so the whole walk can be taken back at once.
 * @param from where the token stood before the piece.
 * @param starts this is the first piece of a walk.
 */
export function noteGlide(token: any, from: Position, starts: boolean) {
  if (starts) noteStep(token, from);
  const id = token.document._source._movementHistory?.at(-1)?.movementId;
  if (!id) return;
  const list = glides.get(token.id) ?? [];
  const walk = starts ? undefined : list.at(-1);
  if (walk) walk.last = id;
  else list.push({ first: id, last: id });
  glides.set(token.id, list.slice(-MAX_STEPS));
}

/**
 * Takes back the last step of a token. In a fight foundry records the movement of a token, taking a step back there
 * also gives back the movement it cost.
 * @returns false when there is nothing to take back.
 */
export async function undoStep(token: any): Promise<boolean> {
  const document = token.document;
  const from = { x: document._source.x, y: document._source.y };
  const own = steps.get(token.id)?.pop();
  const history: any[] = document._source._movementHistory ?? [];
  let moved = false;
  if (history.length) {
    // a free walk goes back to where it started
    const last = history.at(-1).movementId;
    const walk = glides.get(token.id)?.at(-1);
    const glided = !!walk && walk.last === last;
    const movementId = walk && glided ? walk.first : last;
    if (glided) glides.get(token.id)?.pop();
    try {
      moved = await document.revertRecordedMovement(movementId);
    } catch (e) {
      console.warn("combat-controller | recorded movement can not be reverted", e);
    }
  }
  if (!moved && own) {
    moved = !!(await document.update(own));
  }
  if (!moved) return false;
  const list = undone.get(token.id) ?? [];
  list.push(from);
  undone.set(token.id, list);
  return true;
}

/**
 * Does the step again that was taken back last.
 */
export async function redoStep(token: any): Promise<boolean> {
  const to = undone.get(token.id)?.pop();
  if (!to) return false;
  const document = token.document;
  const from = { x: document._source.x, y: document._source.y };
  if (!(await document.update(to))) return false;
  const list = steps.get(token.id) ?? [];
  list.push(from);
  steps.set(token.id, list);
  return true;
}
