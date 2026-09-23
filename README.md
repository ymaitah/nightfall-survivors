# 🌙 Nightfall Survivors

A co-op, online **survivors-like** (in the style of Vampire Survivors) that runs in the browser. You move; your weapons fire on their own. Collect XP gems, pick upgrades, evolve your weapons, and survive with up to 6 friends until dawn.

- **11 characters**, each with a starting weapon and a stat bonus
- **11 weapons + 11 evolutions**, **13 passive items**, max 6 of each per player
- **3 stages** (Moonlit Forest, Bone Crypt, Frostbite Hollow), 10–30 minute runs, Easy / Normal / Hard
- Hordes, elites that drop **treasure chests**, 4 bosses, bat swarms, and closing rings of enemies
- **Shared team XP**: every level-up, everyone picks an upgrade (the game pauses until all have picked)
- **Revive** downed friends by standing on their grave. You can **join a run in progress** (you get catch-up picks), and a dropped connection **reconnects** to the same run
- Permanent **Power-Ups shop** paid for with gold from runs (saved in your browser)
- Keyboard, mouse, gamepad and touch controls. All pixel art and audio are generated in code; there are no asset files

## Run it

You need [Bun](https://bun.sh) **or** [Node.js 18+](https://nodejs.org).

```bash
cd nightfall-survivors
bun install          # or: npm install
bun run start        # or: npm start
```

Open **http://localhost:3000**, click **Create Room**, then **Start Run**. You can play solo too.

## Play with friends

Every friend opens the same URL in their browser. One person (the host) runs the server.

**1. Same Wi-Fi / LAN:** When the server starts it prints a `Network:` address such as `http://192.168.1.23:3000`. Friends on your network open that address. (macOS may ask whether to allow incoming connections. Click Allow.)

**2. Over the internet (quickest):** Use a free Cloudflare quick tunnel. You don't need an account or router setup.

```bash
brew install cloudflared      # Windows: winget install --id Cloudflare.cloudflared
bun run share                 # or: npm run share
```

The server prints a public `https://….trycloudflare.com` link. Send it to your friends. It stays valid while the command keeps running.

**3. Host it permanently (free tiers work):** Push this folder to GitHub, then:
- **Render**: New → Blueprint → select the repo (uses `render.yaml`). Free instances sleep when idle, so the first visit takes about 30 seconds to wake.
- **Fly.io / Railway / any Docker host**: use the included `Dockerfile`. The server listens on `$PORT`.

Once everyone has the page open: the host clicks **Create Room** and then **Copy invite link**. Friends open the link, which joins the room directly, or they type the 4-letter code. Rooms that aren't hidden also appear in the "Open rooms" list on the title screen.

## Controls

| Action | Keyboard / mouse | Gamepad | Touch |
| --- | --- | --- | --- |
| Move | WASD / arrow keys, or hold left mouse | Left stick / d-pad | Drag anywhere |
| Pick upgrade | 1–4, or arrows + Enter, or click | D-pad + A | Tap |
| Reroll (if you own rerolls) | R | X | Tap button |
| Pause (pauses everyone) | Esc / P | Start | ❚❚ button |
| Chat | Enter | | |
| Switch spectator camera when down | Tab / click | A | Tap |

## How it plays

- XP gems are shared by the team. On each level-up every player gets 3–4 choices (luck can give a 4th). If someone is AFK, their pick is made for them after 30 seconds.
- **Evolutions:** get a weapon to level 8, own its paired passive at any level, then open a chest. Chests drop from elites and bosses. The "How to Play" screen lists every pairing.
- Break **braziers** for roast chicken, gold, magnets (pull every gem to you), clocks (freeze enemies) and holy relics (wipe the screen).
- When you go down, a teammate standing next to your grave for 3 seconds brings you back at half health. If everyone is down, the run ends.
- Survive until the timer runs out to win. Gold from the run (coins, chests and an end-of-run bonus) goes into the **Power-Ups** shop.

## Development

```
server/index.js    HTTP static server + WebSocket hub, room list, main tick loop (30 Hz)
server/room.js     Lobby/room lifecycle, reconnects, late joins, dev commands
server/game.js     Authoritative simulation: spawning, enemy AI, all weapons, pickups, level-ups, revives
shared/data.js     All game content and balance: characters, weapons, passives, enemies, stages, power-ups
shared/protocol.js Binary snapshot encoder/decoder (shared by server and client)
public/            Browser client: canvas renderer, procedural sprites, synth audio, UI
tools/sim.js       Headless bot simulation for balance and performance
tools/nettest.js   End-to-end multiplayer test with several headless clients
```

- **Networking:** the server is authoritative for enemies, damage, pickups and XP. Each client predicts its own movement for zero-latency controls, and the server validates it with a speed budget. The server sends a compact binary snapshot per player 15 times a second, culled to what that player can see. The client interpolates everything else. Typical bandwidth is about 5–30 KB/s per player.
- `bun run test` runs the multiplayer end-to-end test (about 49 checks).
- `bun run sim -- 2 20 forest normal` plays a 2-player, 20-minute run with bots and prints per-minute stats.
- `bun run dev` starts the server with chat cheat commands for testing: `/god`, `/xp 100`, `/time 12`, `/give <weapon|passive> [level]`, `/max`, `/chest`, `/spawn <enemy> [n]`, `/elite <enemy>`. Don't use dev mode for real games.
- Balance lives in `shared/data.js` (content) and `server/game.js` (the `DIFFICULTY` table, `hpScale`, spawn density).
