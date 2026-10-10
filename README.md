# Sengoku Warriors

A third-person, one-against-a-thousand action game set in Japan's Warring States period, playable in the browser. Everything on screen and everything you hear is generated in code: there are no model, texture or audio files.

## Run it

https://spud88-stack.github.io/Sengoku-Game/

## Publish on GitHub Pages

The `index.html` in the repo loads TypeScript source, which only works through Vite, so Pages must serve the built site rather than the branch. `.github/workflows/deploy.yml` builds and deploys it on every push to `main`. One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.

## Modes

- **Tutorial**: nine guided steps on the training ground, ending in a duel.
- **Weapons**: katana, cross spear, naginata, twin blades, great sword, iron club, matchlock, and four more: the kusarigama (a sickle on a long chain that drags enemies in), the war fan (quick gusts that bowl crowds over), the great axe (four crushing blows that can't be interrupted) and the fighting staff (both ends strike).
- **Free Mode**: any of 14 officers in any of 7 historical battles, on either side, at four difficulties. Officers gain experience and levels. Each field has its own lie of the land: Ueda Castle on its hill, the gorge at Okehazama, the river plain under Saijoyama at Kawanakajima, the Rengo stream at Nagashino, the Western Army's hill camps at Sekigahara, Osaka Castle on its plateau.
- **Empire Mode**: a turn-based campaign over 31 provinces. Three starting eras (1560, 1570, 1582), any clan, or your own upstart lord. Develop provinces, levy troops, hire and suborn officers, make and break pacts, and fight every invasion yourself or leave it to your generals. Ends in unification or extinction, with an ending that reflects how you ruled.
- **Training Ground**: one rival and a squad, no stakes.
- **Warriors**: design your own officers. Name and title, any weapon, temper and clan, armour and cloth colours, helmet (kabuto, war hat, headband or shinobi hood), crest, mask, back banner, build and battle cries, with ten points to spread across Vitality, Attack, Defence and Speed. Start from scratch or from any historical officer's look. They fight in Free Mode and the Training Ground beside the historical roster and level up the same way.

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
| Stratagems | 1 – 4 | D-pad |
| Battlefield map and pause | M / Esc | Start / Back |
| Debug overlay | ` (backquote) | |

Keys can be rebound under Settings. Settings also has a Graphics level: High adds bloom and denser grass, Low drops resolution and soft shadows for slower machines. The game starts on High (Medium on phones and tablets) and steps down by itself if a battle can't keep a playable frame rate. Menus work with mouse, arrow keys and Enter, or a gamepad.

## How combat works

Light attacks chain into a string. Pressing Heavy at any point in the string ends it with a different finisher: on its own it breaks guards, after one Light it launches, after two it is a flurry into a stun, after three it clears everything around you, after four it launches and slams. Jump after a launcher to keep the combo going in the air. Dodge cancels the end of most attacks. Filling the gold gauge buys an invulnerable Ougi; the violet gauge buys Shura, a short spell of extra speed and damage.

Castles and temples (Ueda, Osaka and the Sanada Barbican, Honnoji, and every castle in Empire Mode) are walled, with three gates. Their own side passes freely; attackers must batter a gate down, troops and officers alike, and a broken gate stays open. Sabotage sets the gates alight too.

Bases fall when their garrison is cut down and no defending officer is standing inside. A battle is won by defeating the enemy commander, taking their main camp, or routing their army.

Stratagems cost command points (the diamonds under your bars). You start with one, earn more by holding the field, every 60 KOs, every officer defeated and every camp taken, and can bank up to five:

- **Fire Arrows** (1): a volley of burning arrows lands on the ground just ahead of you.
- **War Drums** (1): your whole army hits harder and holds firmer for 25 seconds.
- **Reinforcements** (2): a fresh company runs from your nearest camp to fight at your side.
- **Sabotage** (2): the nearest enemy camp is set alight; its garrison is halved and its defenders scatter.

The enemy commander has them too. When a red circle appears around you, get out of it.

If your officer falls in a field battle, command passes to another officer on your side: first an ally still standing, then (in Free Mode) one of two random officers who ride in from your nearest camp, and last of all your commander. The battle is lost when the commander falls. Settings can switch this off so that your officer's fall ends the battle.

## For developers

- `npm run sim -- 600 normal 1 --battle=sekigahara --log` runs a battle headless with every officer on AI.
- `npm run sim -- duel yukimura tadakatsu hard 20` runs AI duels and prints win rates and event counts.
- `npx tsx tools/empireSim.ts s1560 oda 240 1` runs an AI-only Empire campaign.
- URL flags: `?dojo=1&officer=keiji&foe=shingen&n=14&ai=1` (add `&weapon=kusarigama` to hand them any weapon), `?battle=okehazama&officer=nobunaga&side=0&diff=hard`, `&auto=1` to let the AI play your officer.
- All balance numbers are in `src/data/`. See `PROGRESS.md` for the layout and design decisions.
