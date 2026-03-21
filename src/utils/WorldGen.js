import Platform from '../objects/Platform.js';

// Mulberry32 — fast, deterministic PRNG
function createRng(seed) {
  return function () {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Physics constants (mirrored from Player / main config)
const PLAYER_W      = 26;

const CRYSTAL_SCALE   = 1.5;
const CRYSTAL_POINTS  = 100;
const CRYSTAL_COLLECT_DIST = 24; // pickup radius in pixels

// Fuel platform spacing in pixels (1 alt = 8px)
const FUEL_MIN_EARLY = 560;   // 70 alt × 8px
const FUEL_MAX_EARLY = 640;   // 80 alt × 8px
const FUEL_MIN_LATE  = 1280;  // 160 alt × 8px
const FUEL_MAX_LATE  = 1360;  // 170 alt × 8px

// Atmosphere zones — each 500m (4000px)
const ALT_PER_PX = 1 / 8;   // 1 alt meter = 8 pixels
const MAX_ALT    = 2500;     // game ends here
const MAX_PX     = MAX_ALT / ALT_PER_PX; // 20000px of world height

export default class WorldGen {
  constructor(scene, playerStartY, seed) {
    this.scene     = scene;
    this.chunkHeight = 420;
    this.highestY  = playerStartY - 80; // first chunk starts just above the player
    this._all      = [];
    this._crystals = [];
    this._chunkIdx = 0;
    this._rng      = createRng(seed);
    this._lastFuelY = playerStartY;     // track last fuel platform for consistent spacing
    this._nextFuelDist = 0;             // distance until next fuel platform (set on first chunk)
    this._playerStartY = playerStartY;
    this._reachedTop = false;           // true once we've generated up to MAX_ALT
  }

  // ── Helpers ──────────────────────────────────────────────────

  _rand()              { return this._rng(); }
  _randInt(min, max)   { return min + Math.floor(this._rng() * (max - min + 1)); }

  // Altitude in meters at a given world Y position
  _altAtY(y) {
    return (this._playerStartY - y) * ALT_PER_PX;
  }

  // Difficulty factor 0..1 based on altitude (ramps across 5 zones, 0-2500m)
  _difficultyAtY(y) {
    const alt = this._altAtY(y);
    // 0-500m = base difficulty (0), ramps to 1.0 at 2500m
    return Math.min(1, Math.max(0, (alt - 500) / 2000));
  }

  // ── Public API ───────────────────────────────────────────────

  init() {
    for (let i = 0; i < 5; i++) this._generateChunk();
  }

  update(playerY) {
    // Generate ahead (but stop at max altitude)
    while (!this._reachedTop && playerY < this.highestY + this.chunkHeight * 4) {
      this._generateChunk();
    }
    // Destroy platforms far below
    for (let i = this._all.length - 1; i >= 0; i--) {
      if (this._all[i].y > playerY + 1000) {
        this._all[i].destroy(); // Phaser cleans up the matter body
        this._all.splice(i, 1);
      }
    }
    // Destroy crystals far below
    for (let i = this._crystals.length - 1; i >= 0; i--) {
      if (this._crystals[i].baseY > playerY + 1000) {
        this._crystals[i].sprite.destroy();
        this._crystals.splice(i, 1);
      }
    }
  }

  // Check if the player is touching any crystal and collect it
  collectCrystals(playerX, playerY) {
    let points = 0;
    for (let i = this._crystals.length - 1; i >= 0; i--) {
      const c = this._crystals[i];
      const dx = playerX - c.sprite.x;
      const dy = playerY - c.sprite.y;
      if (dx * dx + dy * dy < CRYSTAL_COLLECT_DIST * CRYSTAL_COLLECT_DIST) {
        points += CRYSTAL_POINTS;
        c.sprite.destroy();
        this._crystals.splice(i, 1);
      }
    }
    return points;
  }

  // ── Chunk generation ─────────────────────────────────────────

  _generateChunk() {
    const idx  = this._chunkIdx++;
    const topY = this.highestY - this.chunkHeight;
    const botY = this.highestY;
    const W    = this.scene.scale.width; // 390

    // Stop generating beyond max altitude
    const topAlt = this._altAtY(topY);
    if (topAlt >= MAX_ALT) {
      this._reachedTop = true;
      this.highestY = topY;
      return;
    }

    // Use difficulty at the midpoint of this chunk
    const midY = (topY + botY) / 2;
    const t    = this._difficultyAtY(midY);

    // ── Scaling ──────────────────────────────────────────────
    const widthMult = 4.0 - t * 2.0;                     // 4x → 2x player width (100% → 50%)
    const platWidth = Math.round(PLAYER_W * widthMult);
    const margin = Math.floor(platWidth / 2) + 10;

    // ── Fuel platforms: consistent vertical spacing ──────────
    // Spacing ramps from 560-640px (70-80 alt) to 1280-1360px (160-170 alt)
    if (this._nextFuelDist <= 0) {
      const minDist = FUEL_MIN_EARLY + (FUEL_MIN_LATE - FUEL_MIN_EARLY) * t;
      const maxDist = FUEL_MAX_EARLY + (FUEL_MAX_LATE - FUEL_MAX_EARLY) * t;
      this._nextFuelDist = Math.round(minDist + this._rand() * (maxDist - minDist));
    }

    // Check if a fuel platform falls within this chunk
    const fuelTargetY = this._lastFuelY - this._nextFuelDist;
    if (fuelTargetY >= topY && fuelTargetY < botY) {
      const x = this._randInt(margin, W - margin);
      const y = Math.round(fuelTargetY + (this._rand() - 0.5) * 40); // small jitter

      const p = new Platform(this.scene, x, y, platWidth, 'fuel');
      this.scene.add.existing(p);
      this.scene.matter.add.gameObject(p, {
        isStatic: true,
        label: 'platform',
        friction: 0.8,
      });
      this._all.push(p);

      this._lastFuelY = y;
      this._nextFuelDist = 0; // will recalculate on next chunk
    }

    // ── Crystals: frequency increases with altitude ──
    const platPositions = this._all
      .filter(p => p.y >= topY && p.y <= topY + this.chunkHeight)
      .map(p => ({ x: p.x, y: p.y, hw: p.width / 2 }));

    const crystalCount = this._randInt(1, 2 + Math.floor(t * 4)); // 1-2 early → 3-6 late
    const crystalMargin = 20;
    const MIN_PLAT_DIST = 60; // min distance from any platform edge
    const MIN_CRYSTAL_DIST = 80; // min distance between crystals
    const chunkCrystals = [];
    for (let i = 0; i < crystalCount; i++) {
      const cy = Math.round(topY + this._rand() * this.chunkHeight);
      const cx = this._randInt(crystalMargin, W - crystalMargin);

      // Skip if too close to any platform
      const tooClose = platPositions.some(p => {
        const dx = Math.abs(cx - p.x) - p.hw;
        const dy = Math.abs(cy - p.y);
        return dx < MIN_PLAT_DIST && dy < MIN_PLAT_DIST;
      });
      if (tooClose) continue;

      // Skip if too close to another crystal in this chunk
      const tooCloseToOther = chunkCrystals.some(c => {
        const dx = cx - c.x;
        const dy = cy - c.y;
        return dx * dx + dy * dy < MIN_CRYSTAL_DIST * MIN_CRYSTAL_DIST;
      });
      if (tooCloseToOther) continue;

      chunkCrystals.push({ x: cx, y: cy });
      this._spawnCrystal(cx, cy);
    }

    this.highestY = topY;
  }

  _spawnCrystal(x, y) {
    const sprite = this.scene.add.image(x, y, 'crystal')
      .setScale(CRYSTAL_SCALE)
      .setOrigin(0.5);

    // Gentle floating bob animation
    this.scene.tweens.add({
      targets: sprite,
      y: y - 24,
      duration: 900 + Math.floor(this._rand() * 450),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this._crystals.push({ sprite, baseY: y });
  }
}
