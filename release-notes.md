# Lunar Escape — Release Notes

## Deployment
- Added Cloudflare Pages deployment support via `npm run deploy`
- Installed Wrangler CLI as dev dependency

## New Features

### Menu & Instructions Screen
- Added a title screen with "LUNAR ESCAPE" branding, starfield background, START button, and HOW TO PLAY button
- Instructions screen shows game sprites (crystals, platforms, asteroids) so players know what to look for
- Mock mobile control buttons displayed on the instructions screen so players understand the touch layout
- High score displayed on the title screen if one exists

### Redesigned Mobile Controls
- Replaced the old two-button "press both to thrust" scheme with a new 4-button layout
- Left side: two rotation buttons (`<<` and `>>`) for independent rotation
- Right side: connected horizontal thrust bar with HALF (stutter fire) and FULL (continuous thrust)
- Players can now rotate and thrust simultaneously — no more forced either/or
- Stutter fire pulses at ~8 Hz (65% on / 35% off) for precision maneuvering with less fuel burn
- Sliding finger between HALF and FULL zones is supported

### Crystal Boost
- Collecting a crystal now grants a 2.5-second no-fuel-burn boost
- Fuel bar turns crystal blue and gently pulses while the boost is active
- Picking up a second crystal while boosted resets the timer to 2.5 seconds

### Landing Bonus
- Landing on any platform now awards a +250 point bonus
- Floating "+250 LANDED" text displayed on successful landing (combined with fuel/points text)

### Asteroid Visual Improvements
- Asteroids are now significantly brighter (additive blend layer on top of the dark sprite)
- Added a custom WebGL PostFX shader for a re-entry glow effect
- Shader renders an undulating heated outline that naturally rotates with the asteroid
- Replaced the old graphics-based glow with GPU-accelerated shader pipeline

### Asteroid Hitbox
- Replaced circular collision shape with an 8-sided oval polygon
- Hitbox is inset ~15% from sprite edges for a tighter, fairer fit

## Gameplay Tweaks
- **Up arrow** now works as an alternative thrust key alongside spacebar
- **Score no longer drops** when the player descends — altitude score ratchets to the highest value reached
- **Altimeter still tracks live altitude** — displays current height even when dropping, while the score stays fixed
- **Landing gear deploys 50% faster** (700ms → 467ms)

## Renamed
- Game renamed from "Lunar Climber" to "Lunar Escape"
- Cloudflare project name set to `lunar-escape`
