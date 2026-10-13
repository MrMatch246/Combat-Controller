# Combat Controller
Fight in Foundry VTT with a gamepad. It walks your token and controls [Argon - Combat HUD](https://foundryvtt.com/packages/enhancedcombathud) and everything that comes up when you use it: targets, the areas of spells, dialogs, the token menu.

It is made for one player per screen, and for this set of modules:

| | |
|---|---|
| Foundry VTT | 14 |
| [Argon - Combat HUD](https://foundryvtt.com/packages/enhancedcombathud) with the module for your system | required |
| dnd5e | what it is played with. Other systems that Argon supports should work, advantage / disadvantage is a dnd5e convention |
| [physical-dice-rolls](https://github.com/Rowiz49/physical-dice-rolls) | optional, its window is answered with the gamepad |
| [RSReforged](https://github.com/arrowedisgaming/RSReforged) | optional, rolls right when something is used |

## Setup
Activate the module and connect a gamepad, press any of its buttons so the browser sees it. That is all for a standard gamepad. When several gamepads are connected, the one you used last is yours.

The gamepad drives the token you have selected. With nothing selected it drives the token of your character.

If the sticks and buttons of your gamepad are numbered differently: module settings, "Configure gamepad". Click detect next to a line and use the stick or button.

## Buttons
What a button does depends on what is on the screen, the first line that applies wins.

| On the screen | D-pad, left stick | A | B | X | Y | LB | RB | RT / LT | Back | Start |
|---|---|---|---|---|---|---|---|---|---|---|
| 1. A dialog | field / value | press, confirm | close | | | | | | let go of it | |
| 2. The token menu | focus | press, open palette | leave palette, then menu | close | | | | | | |
| 2b. The character sheet | left / right: tab. Up / down: entry | expand or collapse the entry, use | collapse the entry, then close the sheet | prepare spell, equip item | coins / entries | | hold + up / down: quantity, coins by 10 | | | |
| 3. An area is placed | move the area | place | cancel | | | turn left | turn right | | | |
| 4. Argon asks for targets | ring to next token | target / release | cancel | enough targets | | zoom out | zoom in | | | |
| 5. A movement is planned | move the destination | walk there | drop it | | | | | | | |
| 6. The hud is controlled | d-pad only: focus | use | close drawer or panel, then hide the hud | token menu | next own token | next weapon set | hold + d-pad left / right: jump. Hold + d-pad down / up: undo / redo step. Hold + left stick: precise movement | hold + A: advantage / disadvantage | hide hud | roll initiative / end turn |
| 7. Nothing of that | stick: walk. D-pad up: character sheet | | | token menu | next own token | zoom out | zoom in. Hold + down / up: undo / redo step | RT: door. LT: flip token | open hud | roll initiative / end turn |

In every line:
- the **right stick** pans the map, a **press on the right stick** centers the map on your token.
- a **press on the left stick** opens and closes the drawer of the hud with the saves and skills (line 6 and 7).

Your token only walks in line 7 and to a planned destination. A bar at the top of the screen shows what the buttons do in the lines 1 to 6, it can be turned off in the module settings.

Some details:
- **Walking** (7): only the stick walks your token, the d-pad does not. With the setting "Walk freely" (on by default) the token follows the stick freely, not bound to the grid: pushed a little it walks slowly, in front of a wall it slides along it. In a fight Foundry measures such a walk as it does for a token dragged with shift. With the setting turned off the stick walks from grid space to grid space, also diagonal.
- **Character sheet** (2b): up on the d-pad opens the sheet of your token. Left and right switch between its tabs (inventory, spells, features ...), up and down go through the entries of the tab. Made for the sheet of dnd5e and for Tidy 5e Sheets.
  - A expands an entry and shows its description, A again collapses it. Below an expanded item is what it can be used for, A on one of those uses the item that way. B collapses the item, B on an entry that is not expanded closes the sheet.
  - X prepares a spell or lets go of it, unless it is always prepared. On an item that can be equipped X puts it on or off.
  - Hold RB + up / down: one more or one less of the focused item.
  - Coins: Y puts the focus on the coins of your character, on a tab that shows them like the inventory. Left and right go from coin to coin, up and down add or take one, with RB held ten. Y or B goes back to the entries. Going through the entries never gets you to the coins.
  - In the journal of Tidy 5e Sheets up and down go through the pages, A opens the focused one. On a tab without a list, like the one with the skills, A rolls what is focused.
- **Flip** (7): LT mirrors the image of your token, so it looks left or right.
- **Next own token** (Y): selects your next token on the scene, the gamepad drives that one from then on and the hud of Argon shows it. Your character comes first, then what else belongs to you by name: a summoned creature, a familiar, a mount.
- **Dialogs** (1): also windows that ask you to choose, like the one of dnd5e for an item that can be used in several ways (e.g. Summon / Summon free casting). Left and right go from field to field, up and down move the focus as well. On a number up and down change it instead. On a selection the d-pad moves the focus on and the left stick steps through its options. A die of physical-dice-rolls counts from 1 with up and from its highest value with down. A on a selection goes on to its next option, A on a number confirms the dialog. A dialog that comes up while you walk is taken as well, Back lets go of it and leaves it open. Hold RB + up / down to change a number by 5, e.g. the result of a real die, or to step through the options of a selection.
- **Token menu** (2): what a right click on your token shows.
- **Areas** (3): the area of a spell starts at your token. The stick moves it freely, the d-pad by whole grid spaces, held LB / RB keep turning it. An aura attaches to the token it is moved onto. B cancels the placement. This also works for an item that was used from the character sheet or with the mouse.
- **Targets** (4): with the setting "target picker" of Argon. A ring in your color starts at the nearest enemy and shows how far away the token is.
- **Hud** (6): only the d-pad moves the focus, the left stick is for the token. A also opens a panel (e.g. spells) and expands or collapses a spell level. Hold RT / LT + A is an alt-click / ctrl-click, with the default keys of dnd5e that is advantage / disadvantage. RB + left / right jumps between the buttons that open a panel: cast spell, use item ... of action, bonus action, reaction. B closes what is open, with nothing left open it hides the hud and you walk again.
- **Precise movement** (5): with the hud open, hold RB and push the left stick. A ruler grows from your token to a destination that the stick moves freely, not from grid space to grid space, like dragging a token with shift held: Foundry shows the distance. Pushing the stick a little moves it slowly, the d-pad moves it by a tenth of a grid space. Once started RB is not needed anymore. A lets the token walk there in a straight line, B drops it. The destination can not go where a wall is between it and your token.
- **Undo / redo**: hold RB, down takes back the last step the gamepad made with the token, up does it again. In a fight the movement it cost is given back.
- **Start**: in a fight it rolls the initiative of your token as long as it has none, also when the token does not take part yet. Once it has one, it ends your turn when it is your turn. Both only when the hud of Argon shows your token.
- **RB** zooms in and modifies the d-pad. When it turns out to be the modifier, the zoom goes back to what it was.

## Settings
All stored in the browser.
- **Configure gamepad**: which stick and button is used for what.
- **Button hints**: the bar that shows what the buttons do.
- **Rumble on your turn**: the gamepad rumbles when the turn of your token starts.
- **Combat hud on your turn**: opens the hud when the turn starts and leaves it when the turn ends. Off by default.
- **Token speed**: how fast your token walks, in grid spaces per second.

## Limitations
- Text can not be typed with the gamepad.
- Argon and the systems have no api for a gamepad. This module walks the components of the hud and uses the listeners they registered for the mouse, so an update of Argon, the system or Foundry can break a part of it. The parts are independent: when one breaks the others keep working.
- The browser has to see the gamepad. Some gamepads register as something else, and a gamepad that another application uses may not show up.

## Development
```
pnpm install
pnpm typecheck && pnpm test
pnpm build        # into dist/
pnpm devbuild     # into the modules folder of foundry named as devDir in package.json
```

## Credits
Based on [Beaver's Gamepad](https://github.com/AngryBeaver/beavers-gamepad) by angryBeaver, which is made for several players with several gamepads around one screen. Reading the gamepad, walking the token, detecting bindings and opening doors come from there. MIT License.
