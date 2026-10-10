# Sengoku Warriors: build brief

## What I want and why

I'm a long-time fan of Dynasty Warriors and Samurai Warriors, and I want you to build me a game in that tradition: a third-person, one-against-a-thousand action game set in Japan's Sengoku period, with a Free Mode and an Empire Mode like the Warriors and Empires games have. This is a personal project for fun. The bar is not a feature checklist. The bar is that I can sit down, pick an officer, and still be grinning an hour later because cutting through a crowd feels fantastic and the battlefield around me feels alive.

This folder is empty. You are starting from nothing and you own every design and technical decision I haven't made below. Where I've left something open, pick what makes the best game and keep going; only stop to ask me about something if it is truly mine to decide and you can't proceed on any other part of the work without it.

## Technical foundation

Build it for the browser with TypeScript, Three.js and Vite, with no backend and saves in localStorage. I chose this because you can run it, look at it, and play it yourself in the browser preview, which matters more than anything else in this brief (see "How to work").

There is no artist on this project, so generate every asset in code: characters, weapons, terrain, castles, effects, UI art, music and sound. Do not download models, textures or audio. A coherent stylized look will beat a pile of mismatched free assets, so commit to one: low-poly figures with strong, readable silhouettes and bold clan colors, and a UI drawn from ink wash painting, ukiyo-e prints, mon crests and brush calligraphy. Characters need procedural skeletal animation good enough that attacks have anticipation, a fast strike, and follow-through. Stiff, floaty animation will sink the combat no matter how good the systems are.

Performance is a design requirement, not a later optimization. I want 300 or more soldiers on screen at 60 fps on a normal laptop. Plan for that from the first line: instanced rendering for troops, a spatial hash for hit detection and neighbor queries, a fixed-timestep simulation separate from rendering, pooled particles and decals, and cheaper abstract simulation for fighting that happens far from the camera.

## Priorities, in order

1. Combat feel.
2. A battlefield that feels alive, driven by smart officers.
3. Empire Mode depth.
4. Breadth of content (more officers, maps, weapons).

When these compete for your time, the higher one wins. Six officers with truly different movesets are worth more than twenty reskins.

## Combat

Use the classic Warriors structure: a light attack string where pressing heavy at any point branches into a different finisher (a launcher after the first hit, a stun after the second, a wide crowd-clear after the third, and so on), plus jump attacks, a dash attack, a dodge with invulnerability frames, guard, a timed parry that opens officers up, and a gauge that fills as you fight and unleashes a screen-clearing super. Add a rage or awakening state on a second, slower gauge that changes the moveset for a short time. Include horses: mount, charge through crowds, attack from the saddle.

What makes this genre feel good is mostly invisible, and I want all of it:

- Hitstop on every connecting blow, scaled to the weight of the hit, with a longer freeze and brief slow motion when you finish an officer.
- Enemies that react physically: stagger, knockback, launch, juggle in the air, ragdoll-style tumbles, bodies thrown into other soldiers.
- Input buffering and generous cancel windows so the controls never drop an input, with dodge able to cancel most recoveries.
- Soft targeting that nudges attacks toward the nearest sensible enemy without taking control away from me, and a lock-on for officer duels.
- Weapon trails, hit sparks, dust, camera shake and a camera that pulls back in a crowd and tightens in a duel.
- Sound that sells impact: layered whooshes, cuts and thuds synthesized in WebAudio, with pitch variation so a 50-hit combo doesn't sound like a machine gun.
- A KO counter and combo counter with escalating callouts at milestones (100, 500, 1000 KOs).

Blood is part of the look. Every cutting hit should throw a spray in the direction of the swing, heavy hits and finishers a bigger burst, and blood should land on the ground as decals that persist through the battle up to a performance cap. Keep it stylized, like red ink flung from a brush, which fits the art direction. Add a setting to turn it down or off.

Regular soldiers exist to be mown down, but they shouldn't be furniture. They should surround me, attack in turns, and include a few types that change how I fight: spearmen who hold a line, archers and matchlock gunners who punish standing still, shield bearers, cavalry, and squad captains who buff their men until killed.

## Smart officers

This is the part I care about most after combat feel. Enemy and allied officers should seem like they are thinking, on two levels.

In a duel, an officer should fight like an opponent, not a damage sponge. They guard, dodge, and punish me when I whiff. They use their own combos and their own super. They break my guard if I turtle and back off if I'm mid-super. They adapt within a fight, so mashing the same string gets blocked and countered after a few repetitions. Give each a personality (reckless, patient, cunning, honorable) that visibly changes how they fight. Difficulty should scale reaction time, aggression and decision quality rather than just health and damage.

Across the battlefield, each officer should make their own decisions about what to do next: take a base, defend one, reinforce an ally who is losing, flank, set an ambush, hunt me down if I'm doing too much damage, or retreat to heal when badly hurt. A utility-scoring approach works well for this, with each side's commander setting the overall plan and officers weighing it against what they see. Officers should react to morale and to events such as a base falling or their commander being threatened. Allied officers should be useful and should ask for help when they need it. NPC officers must be able to fight and defeat each other without me.

Make the intelligence visible. Officers should announce what they're doing in a battle log and with short on-screen lines ("Honda Tadakatsu is moving to cut off our supply line!"), because AI the player can't perceive might as well not exist.

## Battlefields

Battles take place on large maps with bases to capture, supply lines, gates and castle keeps, troop morale that shifts with captures and officer defeats, and victory and defeat conditions centered on the commanders. Include scripted and dynamic events: ambushes, reinforcements arriving, a gate being breached, a betrayal, a fire attack. I need a minimap, an overview map on pause, objective prompts, and missions that pop up mid-battle with rewards. Base the maps on famous battles (Okehazama, Kawanakajima, Nagashino, Sekigahara, the siege of Osaka and others you choose) and give each a distinct layout and a twist of its own.

## Roster

Use historical Sengoku figures: Oda Nobunaga, Toyotomi Hideyoshi, Tokugawa Ieyasu, Takeda Shingen, Uesugi Kenshin, Sanada Yukimura, Date Masamune, Honda Tadakatsu, Akechi Mitsuhide, Saika Magoichi, Tachibana Ginchiyo, Mori Motonari, Shimazu Yoshihiro and others. These are real people, so they're free to use, but design them yourself. Do not copy Koei Tecmo's character designs, move names or terminology; invent your own names for the systems too.

Start with at least six distinct weapon movesets (for example katana, yari, naginata, dual blades, odachi, kanabo, matchlock with short sword, bow) and grow the playable roster to twelve or more, plus a larger pool of generic and minor historical officers for Empire Mode. Officers level up, find weapons with random attributes, and unlock skills.

## Free Mode

Pick any unlocked officer, any battle, either side and a difficulty, and play. Show a pre-battle briefing with the map and both armies, and a results screen afterwards with KOs, time, officers defeated, a grade, and loot.

## Empire Mode

A turn-based strategy layer over a province map of Japan, where every battle is fought in the action game.

- Choose a starting scenario (for example 1560, 1570 and 1582) and a clan, or create a custom officer and start with one province.
- Each season, spend a limited number of actions: develop provinces for gold and rice, recruit and train troops, fortify, hire or search for officers, conduct diplomacy (alliances, truces, demands, marriages), plot, or invade.
- The strategy layer must shape the battles. Troop counts, which officers were assigned, fortification level, supplies and alliances should all show up on the field, and pre-battle stratagems (ambush, night raid, flood, bribed defector) should trigger as events during the fight.
- Officers have loyalty, ambitions and relationships. They can defect, rebel, or be captured and then recruited, released or executed.
- Rival clans run the same systems and should expand, ally and backstab believably.
- Offer auto-resolve for battles I don't want to fight, and proper save and load.
- The campaign ends in unification, with an ending that reflects how I got there.

## Polish I'd like

A title screen with atmosphere, an officer select with stats and move lists, full keyboard and mouse and gamepad support with rebinding, a settings menu (volume, blood, camera, difficulty), officer entrance and defeat callouts, a procedural soundtrack with taiko, shamisen and flute textures that intensifies in combat, weather and time of day, a tutorial battle, and a gallery of unlocked officers and weapons. Add whatever else you think makes this better. I trust your taste, and good surprises are welcome.

## How to work

Build a vertical slice first: one officer, one map, a few hundred soldiers, one enemy officer, with full hit feedback and blood. Then stop adding features and tune it until it is fun, because everything else rests on that. Only then widen out to the roster, battlefield systems, Free Mode, and finally Empire Mode.

Verify by playing. After each meaningful change, run the game in the browser, control it, take screenshots, read the console and check the frame time. Typechecking and a passing build tell you nothing about whether a sword swing feels right or whether an officer is stuck walking into a wall. Do not tell me something works unless you have watched it work, and if something is unfinished or rough, say so plainly.

Build the tools that make that verification cheap: a debug overlay (fps, entity counts, AI state above officers' heads), cheats to spawn officers and jump to any battle, and a headless simulation you can run from the command line to test officer AI, battle outcomes and many seasons of Empire Mode quickly.

Keep all tuning values (damage, hitstop frames, AI weights, economy numbers) in data files, separate from logic, so balancing doesn't mean hunting through code.

This is a long job that will span many context windows. Initialize git and commit at each milestone. Keep a short progress file in the repo recording what is done, what is in progress, what you decided and why, and what comes next, and update it as you go so you can pick the work back up cleanly. Write a README with how to run the game and the controls.

## Done means

I can run one command, land on a title screen, and play both modes from start to finish. Combat is smooth, punchy and bloody at 60 fps with hundreds of soldiers on screen. Officers fight and maneuver in ways I can see and have to respond to. An Empire campaign can be played from one province to unification, saved and resumed. Nothing I can reach from the menus is a stub.
