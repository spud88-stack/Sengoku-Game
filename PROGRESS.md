# Progress

Build brief: `PROMPT.md`. Player-facing notes: `README.md`. Node lives in `~/.local/node/bin` on this machine (add it to PATH).

## Layout
- `src/sim/` pure logic, no rendering imports, runs headless.
  - `world.ts` battle state: soldiers (kinds in `SK`), bases, reinforcement waves, projectiles, items, missions, scripted events, victory rules.
  - `fighter.ts` officer state machine shared by player and AI, including mounts.
  - `ai.ts` officer AI: strategic goals plus the duel layer.
  - `empire.ts` Empire Mode: economy, commands, diplomacy, AI clans, auto-resolve, and `engagementBattle` which turns an invasion into a `BattleDef`.
- `src/view/` Three.js: `rig.ts`/`pose.ts`/`anims.ts` (procedural samurai, clips built from move timings), `crowd.ts` (instanced troops, horses, arrows), `fx.ts`, `scene.ts` (stage, sky themes, weather), `battleView.ts`, `portrait.ts`.
- `src/ui/` DOM: `hud.ts`, `screens.ts` (all menus), `empireScreens.ts`, `tutorial.ts`.
- `src/data/` tuning and content: `tuning.ts`, `moves.ts`, `officers.ts`, `battles.ts`, `empire.ts`.
- `tools/` headless runners.

## Test hooks
- `__game.advance(seconds, untilFn)` steps frames by hand (the preview pane throttles rAF; screenshots need a short wait after).
- `__game.input.inject('light')`, `.hold('KeyW', true)`; `__game.view.debugDist = 5`; `__game.shell.menu()`.

## Done
- Combat: strings and charge finishers for 7 weapons, air attacks, dash, dodge, guard, parry, Ougi, Shura, lock-on, horses (trample, saddle attacks), hitstop, shake, trails, blood spray and persistent decals, slow motion on officer kills.
- Soldiers: spear, banner, archer, gunner, shield, cavalry, captain (buff aura).
- Officers: 14 playable, about 45 named minor officers. AI verified with duel statistics per difficulty.
- Battles: 7 historical maps with events (ambush, reinforcements, defection), 5 sky themes, missions, pickups.
- Shell: title, menus over an attract battle, Free Mode setup, pause with full map, results and grades, levelling, settings, rebinding, gallery, tutorial, generative music.
- Empire Mode: 3 scenarios, custom lord, 31 provinces, development, levies, search/hire/reward/suborn, pacts and betrayal, stratagems that appear in battle, allied reinforcements, captives, auto-resolve, save/resume, four endings.

## Decisions worth knowing
- Sim is 2D plus height. Terrain is flat; camps are open rings, so no pathfinding is needed.
- Tempo is tuned so an AI-only battle lasts 4 to 13 minutes: AI officers march at half speed, hurt each other at `npcDuelScale`, and a camp cannot fall while a defending officer stands in it. The player ignores all three limits, which is what makes them decisive.
- Reinforcement waves are per army, not per camp, so holding more camps does not snowball troop numbers.
- Own terms throughout (Ougi, Shura); officers are historical people with original designs.

## Known rough spots / next
- Attack animation is readable but stiff; the off hand does not truly grip polearms and mounted legs are a fixed pose.
- AI officers never mount horses.
- No castle interiors, gates or walls; every map is the same seven-camp layout (five at Honnoji) with different names, armies, skies and events.
- Free Mode has no weapon drops or skill unlocks; progression is levels only.
- Balance was tuned from headless statistics and short scripted sessions, not from long hands-on play.
