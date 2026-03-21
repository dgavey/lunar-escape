# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Lunar Climber" — a Phaser.js browser game where the player flies a lunar lander upward indefinitely, collecting fuel and points from platforms. All assets are procedurally drawn (no external images).

## Commands

- `npm run dev` — Start Vite dev server with hot reload
- `npm run build` — Production build to `dist/` as a single bundled HTML file (via vite-plugin-singlefile)

No test framework is configured.

## Architecture

**Physics engine:** Matter.js (via Phaser's built-in Matter integration), not Arcade physics. Canvas is 390×844 (mobile-first, scaled to fit).

**Scene structure:** Two scenes run simultaneously during gameplay:
- `GameScene` — owns the Player, WorldGen, camera, collision handling, and scoring. Listens to Matter collision events directly.
- `UIScene` — HUD overlay (fuel bar, score, altitude) and touch button input. Communicates player input to GameScene by setting flags on `game.player._btnLeft/Right/Thrust`. Listens for `'gameover'` event from GameScene.

`MenuScene` exists but is not currently wired into the scene list in `main.js` — the game launches directly into GameScene.

**Player (`objects/Player.js`):** Extends `Phaser.GameObjects.Rectangle` (invisible) with a Matter body. Visual lander is drawn on separate `Graphics` objects synced each frame. Handles keyboard + touch input, thrust physics, fuel consumption, and tipping detection.

**WorldGen (`utils/WorldGen.js`):** Procedurally generates platforms in vertical chunks using a seeded PRNG (Mulberry32). Difficulty ramps over ~25 chunks by shrinking platform width and reducing fuel refills. Platforms far below the player are destroyed for cleanup.

**Platform (`objects/Platform.js`):** Simple Rectangle with a type (`fuel`, `points`, or neutral). Matter body is added externally by WorldGen. Dims when collected.

**Key game mechanics:**
- World wraps horizontally (player teleports across screen edges)
- Camera only scrolls upward, never down — falling off-screen = game over
- Platform collection requires the ship to be stable (nearly upright, low velocity)
- Crash detection uses pre-collision velocity stored in `beforeupdate`
- High scores saved to `localStorage` under key `lunarClimberHi`
- Debug console commands: `god()`, `noclip()`, `mortal()`, `seed(hex)`
