# Lunar Climber — Game Plan

## Concept
A lunar lander-style game where the player flies upward indefinitely. The goal is to climb as high as possible before running out of fuel. Platforms are scattered throughout, some offering points and others offering fuel refills.

## Tech Stack
- **Phaser.js** — latest version (via CDN or npm), plain JavaScript (no TypeScript)
- **Bundler** — Vite, outputs a single bundled HTML+JS file (or inline everything into one `.html`)
- **Assets** — procedurally drawn shapes only (Phaser Graphics API), no external image files

## Core Mechanics

### Physics
- Gravity pulls the player down constantly
- Player fires thrusters to counteract gravity and steer
- Fuel depletes while thrusters are active
- Game ends when fuel hits zero and the player can no longer maintain altitude (falls off the bottom of the screen)

### Controls
- **Mobile (primary):**
  - Tap left half of screen = rotate left
  - Tap right half of screen = rotate right
  - Hold both sides simultaneously = thrust
- **Desktop (secondary):**
  - Left / Right arrow keys = rotate
  - Space = thrust

### Camera
- Camera scrolls upward with the player
- The world generates infinitely upward (procedural platform placement)
- Falling below the bottom of the screen = game over

## World & Platforms

### Platform Types
| Type | Color | Effect |
|------|-------|--------|
| Points | Yellow/Gold | Landing or flying through awards score |
| Fuel | Green | Refills a portion of fuel on contact |
| Neutral | Gray | No effect, just an obstacle/rest point |

### Procedural Generation
- Platforms are generated in chunks as the player climbs
- Density and gap size increase with altitude (harder the higher you go)
- Minimum guarantee: fuel platforms appear often enough to keep the game winnable at low altitudes, tapering off at high altitudes

## Scoring
- Score = altitude reached (in meters/units) + bonus points from point platforms
- High score persisted in `localStorage`

## UI / HUD
- Fuel bar (top or side of screen)
- Current score / altitude
- High score display
- Game over screen with score, high score, and restart button

## Project Structure
```
simple-game-test/
├── index.html
├── src/
│   ├── main.js          # Phaser game config, entry point
│   ├── scenes/
│   │   ├── GameScene.js # Main gameplay
│   │   ├── UIScene.js   # HUD overlay (runs in parallel)
│   │   └── MenuScene.js # Start screen / game over
│   ├── objects/
│   │   ├── Player.js    # Lander sprite, physics, fuel
│   │   └── Platform.js  # Platform types and rendering
│   └── utils/
│       └── WorldGen.js  # Procedural platform generation
├── package.json
└── vite.config.js       # Configured to output single bundled file
```

## Milestones

1. **Scaffold** — Vite + Phaser setup, blank scene renders
2. **Player** — Lander shape, gravity, thruster controls (keyboard)
3. **Camera** — Infinite upward scroll, world bounds
4. **Platforms** — Procedural generation, platform types, collision
5. **Fuel System** — Fuel bar, depletion, refill on fuel platforms
6. **Scoring** — Altitude score, point platforms, high score save
7. **Mobile Controls** — Virtual joystick / touch zones
8. **Polish** — Game over screen, juice (thruster particles, screen shake), tuning
9. **Build** — Vite production build → single output file
