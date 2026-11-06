# 🎯 Rumble Arena

**A fast, tactical arcade FPS that runs in your browser.** Chain kills, land headshots, dash through fire, and fight bot waves, a three-phase boss, or up to 8 friends in real-time PvP.

Built with [Three.js](https://threejs.org/) and a tiny dependency-free Node.js server. No build step, no `npm install`.

---

## ✨ Features

- **Rampage mode**: endless waves of bots. Clear a wave without taking damage for a *Flawless* bonus.
- **Boss fight**: face *The Hollow Warden* across three phases. Learn its moves.
- **Online PvP**: up to 8 players, first to **20 kills** wins. Server-authoritative movement and hit detection.
- **Six weapons**: Pistol, Rifle, Shotgun, SMG, Sniper, and Rocket launcher, with a loadout screen before each run and each respawn.
- **Two arenas**: *The Yard* (balanced cover, open sightlines) and *The Crucible* (tight lanes, stacked central cover).
- **Four difficulties**: Easy, Normal, Hard, Nightmare.
- **Game feel**: kill feed, damage numbers, multi-kill announcements, hit-stop, directional damage ring, radar, combo meter, XP and levels.
- **Pickups**: green orbs heal; gold orbs trigger **OVERDRIVE** (infinite ammo, faster fire, 2× score).
- **Controller support** with directional rumble (hits from your left shake the left motor harder).
- **Accessibility**: colorblind palette, reduced-motion support, adjustable camera shake, effects, volume and sensitivity.
- **Developer tools (solo)**: ghost flight, frozen bots, hitboxes, invulnerability, infinite ammo, one-shot kills, no recoil and an FPS counter.

## 🚀 Quick start

You only need [Node.js](https://nodejs.org/) 16 or newer.

```bash
git clone https://github.com/<your-username>/rumble-arena.git
cd rumble-arena
node server.js
```

Open **http://localhost:8000** and play.

> The game loads Three.js from a CDN, so the first load needs an internet connection.

## 🎮 Controls

| Action | Keyboard & mouse | Gamepad (X-input) |
| --- | --- | --- |
| Move | `W` `A` `S` `D` | Left stick |
| Aim | Mouse | Right stick |
| Fire | Left click | `RT` |
| Aim down sights | Right click | `LT` |
| Jump | `Space` | `A` |
| Sprint | `Shift` | `LB` / `L3` |
| Dash | `E` | `B` |
| Reload | `R` | `X` |
| Pistol / primary | `1` / `2` | `RB` or D-pad ◀ to swap |
| Scoreboard (PvP) | Hold `Tab` | n/a |
| Pause / settings | `Esc` | `Start` |

Switch your pad to X-input mode, press any button on it, then hit Start.

Open the pause menu for the tabbed **General**, **Controls**, **Crosshair**, **Developer**, **Video**, and **Audio** settings. Keyboard bindings save on this device, and **Reset all to default** restores the original keys. Video settings change the live render scale and shadow-map quality. In solo mode, enable **Developer mode**, then type `PANEL` to open the developer tools window.

## 🌐 Multiplayer

PvP uses the same Node process that serves the game, so there is nothing extra to run.

**Play with friends on the same network**

1. Start the server: `node server.js`
2. Share `http://<your-LAN-ip>:8000` with friends.
3. Everyone enters a name and clicks **PLAY ONLINE · PvP**. The server address is pre-filled.

**Rules of the match**

- Up to 8 players. First to 20 kills wins, then the match resets after 5 seconds.
- Respawn after 3 seconds with 2 seconds of spawn protection.
- Getting a kill restores 20 HP.
- The server locks each match to the **first player's arena**. Later players must select the same arena in the menu to join.

**Host on the internet**

Put the server behind a reverse proxy that provides HTTPS (Caddy and nginx both work), so browsers connect over `wss://`. If you serve the game page from a different origin (for example GitHub Pages) than the game server, allow it explicitly:

```bash
ALLOWED_ORIGINS=https://<your-username>.github.io node server.js
```

Players then type your `wss://your-server.example` address into the server box in the menu.

### Server configuration

All optional, set as environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8000` | HTTP and WebSocket port |
| `HOST` | `0.0.0.0` | Bind address. Use `127.0.0.1` for local-only |
| `ALLOWED_ORIGINS` | *(same-origin only)* | Comma-separated extra browser origins allowed to connect. `*` allows any |
| `MAX_CONN` | `64` | Max simultaneous sockets |
| `MAX_CONN_PER_IP` | `12` | Max sockets per IP. `0` disables (use this behind a reverse proxy) |

## 📄 Hosting on GitHub Pages

The single-player modes (Rampage and Boss fight) are fully static, so they work on GitHub Pages:

1. Push the repo, then go to **Settings → Pages**.
2. Choose **Deploy from a branch**, select `main` and `/ (root)`.
3. Open `https://<your-username>.github.io/rumble-arena/`.

PvP needs the Node server running somewhere else (see above).

## 🗂️ Project structure

```
rumble-arena/
├── index.html        # The whole game: rendering, input, bots, boss, HUD, PvP client
├── ui-tokens.css     # Design tokens: colors, fonts, motion timing
├── server.js         # Static file server + PvP WebSocket server (no dependencies)
├── docs/
│   └── UI_TUNING.md  # UI audit and a guide for tuning feel and motion
├── package.json
├── SECURITY.md
└── LICENSE
```

### Optional weapon models

The game looks for animated weapon models (`pistol_shooting.glb`, `rifle_shooting.glb`, `rifle_reload.glb`) in the project root or a `models/` folder. If they are missing it falls back to simple box-shaped guns, so the game is fully playable without them.

## 🛠️ Customizing

- **Look and feel**: edit `ui-tokens.css` (colors, fonts, animation speed). See [`docs/UI_TUNING.md`](docs/UI_TUNING.md) for the tuning order.
- **Add or change an arena**: edit `ARENAS` in `index.html` **and** the matching `ARENAS` array in `server.js`. The coordinates must stay identical or multiplayer collisions and hits will not match what players see.
- **Weapons and damage**: weapon stats live in the `W` array in `index.html`. The server mirrors fire rate and pellet counts in its `WP` table, and `DS` scales damage into HP.

## 🔒 Security notes

- The server only serves an allowlist of asset types, never dotfiles, `server.js` or `package.json`.
- WebSocket connections are origin-checked, connection-capped, rate-limited and time-limited. All client input is validated, and the server decides movement and hits.
- The page ships with a Content-Security-Policy and escapes all server-supplied names before rendering them.
- There is no authentication or TLS built in. Use a reverse proxy for `wss://` on the public internet.
- Three.js is loaded from a CDN **without Subresource Integrity hashes**. For a hardened deployment, download the two scripts into the repo and reference them locally, or add `integrity="sha384-..."` attributes (generate with `openssl dgst -sha384 -binary file.js | openssl base64 -A`).
- `ui-tokens.css` loads fonts from Google Fonts, which sends visitors' IP addresses to Google. Self-host the *Rajdhani* and *Teko* fonts if that matters for your audience.

See [`SECURITY.md`](SECURITY.md) for how to report a vulnerability.

## 🤝 Contributing

Issues and pull requests are welcome. Please keep the game dependency-free and the client/server arena data in sync.

## 📜 License

[MIT](LICENSE)
