# Sengoku Warriors

A third-person, one-against-a-thousand action game set in Japan's Warring States period, playable in the browser. Everything on screen and everything you hear is generated in code: there are no model, texture or audio files.

## Run it

Node 20 or newer is required.

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173. `npm run build` produces a static site in `dist/`.

## Publish on GitHub Pages

The `index.html` in the repo loads TypeScript source, which only works through Vite, so Pages must serve the built site rather than the branch. `.github/workflows/deploy.yml` builds and deploys it on every push to `main`. One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.

## Modes

- **Tutorial**: nine guided steps on the training ground, ending in a duel.
- **Free Mode**: any of 14 officers in any of 7 historical battles, on either side, at four difficulties. Officers gain experience and levels.
- **Empire Mode**: a turn-based campaign over 31 provinces. Three starting eras (1560, 1570, 1582), any clan, or your own upstart lord. Develop provinces, levy troops, hire and suborn officers, make and break pacts, and fight every invasion yourself or leave it to your generals. Ends in unification or extinction, with an ending that reflects how you ruled.
- **Training Ground**: one rival and a squad, no stakes.

## Controls

| Action | Keyboard and mouse | Gamepad |
| --- | --- | --- |
| Move | WASD | Left stick |
| Camera | Mouse (click the game to capture it) or arrow keys | Right stick |
| Light attack | Left mouse / J | X |
| Heavy attack | Right mouse / K | Y |
| Jump | Space | A |
| Dodge | Shift | RB |
| Guard (tap just before a hit to parry) | Q / L | LB |
| Ougi (gold gauge full) | F / I | B |
| Shura (violet gauge full) | R | Either trigger |
| Lock on to an officer | Tab / middle mouse | R3 |
| Mount or dismount | E | L3 |
| Battlefield map and pause | M / Esc | Start / Back |
| Debug overlay | ` (backquote) | |

Keys can be rebound under Settings. Menus work with mouse, arrow keys and Enter, or a gamepad.

## How combat works

Light attacks chain into a string. Pressing Heavy at any point in the string ends it with a different finisher: on its own it breaks guards, after one Light it launches, after two it is a flurry into a stun, after three it clears everything around you, after four it launches and slams. Jump after a launcher to keep the combo going in the air. Dodge cancels the end of most attacks. Filling the gold gauge buys an invulnerable Ougi; the violet gauge buys Shura, a short spell of extra speed and damage.

Bases fall when their garrison is cut down and no defending officer is standing inside. A battle is won by defeating the enemy commander, taking their main camp, or routing their army.

## For developers

- `npm run sim -- 600 normal 1 --battle=sekigahara --log` runs a battle headless with every officer on AI.
- `npm run sim -- duel yukimura tadakatsu hard 20` runs AI duels and prints win rates and event counts.
- `npx tsx tools/empireSim.ts s1560 oda 240 1` runs an AI-only Empire campaign.
- URL flags: `?dojo=1&officer=keiji&foe=shingen&n=14&ai=1`, `?battle=okehazama&officer=nobunaga&side=0&diff=hard`, `&auto=1` to let the AI play your officer.
- All balance numbers are in `src/data/`. See `PROGRESS.md` for the layout and design decisions.
