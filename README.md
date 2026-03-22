# Lunar Escape

Lunar Escape is a mobile-first browser game built with Phaser and Matter.js. Pilot a small lunar lander upward through procedurally generated platforms to collect fuel and points, avoid tipping or crashing, and climb as high as possible.

## Quick start

1. Install dependencies: `npm install`
2. Run the dev server with hot reload: `npm run dev`
3. Build a single-file production bundle: `npm run build` (output in `dist/`)

Open the dev server URL in a mobile-sized browser or resize your desktop browser to get the intended experience.

## Controls

- Keyboard: Left/Right arrows to rotate/translate, Up arrow (or Space) to thrust.
- Touch: On-screen left/right/thrust buttons are available via the HUD for touch devices.

## Gameplay

- The world wraps horizontally — moving off one side teleports you to the other.
- The camera only scrolls upward. Falling below the bottom of the screen ends the run.
- Platforms may grant fuel or points; collecting fuel refills your thruster while points increase score.
- The player must be relatively upright and slow to successfully collect platform bonuses.

## Project structure (high level)

- `src/` – main game source
  - `objects/Player.js` – lander object and physics handling
  - `objects/Platform.js` – platform objects
  - `utils/WorldGen.js` – procedural platform generator
  - `scenes/` – GameScene and UIScene coordinate gameplay and HUD
- `public/` – static assets
- `dist/` – production build output

## Development notes

- Physics: Uses Phaser's Matter.js integration (not Arcade physics).
- Canvas is designed at 390×844 (mobile-first), then scaled to fit the viewport.
- High scores are stored in localStorage under the key `lunarClimberHi`.
- Debug console helpers available in-game include `god()`, `noclip()`, `mortal()`, and `seed(hex)`.

## Play online

Play the hosted version: https://lunar-escape.gavey.ca/

## Credits

Prototype and code by the project author. Some game art and assets were sourced from Matt Walkden's "Lunar Battle Pack" (https://mattwalkden.itch.io/lunar-battle-pack). Sound effects are variations of openly-licensed (Creative Commons / Open Content) sounds found online and were not all tracked individually. Remaining visuals are generated procedurally at runtime.

## License

The project's source code is released under the MIT License. Add a LICENSE file with the MIT text to the project root to make this explicit.

Assets (art and sound) are from mixed sources and may be covered by different licenses (e.g., Creative Commons, third-party packs). Contributors and redistributors must verify the original asset sources and comply with their licenses before reusing or redistributing assets.
