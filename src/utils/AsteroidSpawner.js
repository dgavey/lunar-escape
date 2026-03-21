// Mulberry32 — same PRNG as WorldGen for seed consistency
function createRng(seed) {
  return function () {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const MIN_ALT       = 200;   // asteroids start at altitude 200
const BASE_INTERVAL = 80;    // one asteroid per 80 alt at the start
const MIN_INTERVAL  = 15;    // fastest spawn rate at high difficulty
const SPEED_BASE    = 2.0;   // starting speed
const SPEED_MAX_ADD = 3.0;   // max additional speed at high altitude
const SCALE         = 2;     // 2x source size for the small asteroid

export default class AsteroidSpawner {
  constructor(scene, seed) {
    this.scene = scene;
    this._rng = createRng(seed ^ 0xA57E401D); // offset seed from WorldGen
    this._asteroids = [];
    this._nextFgAlt = MIN_ALT;       // foreground spawn tracker
    this._nextBgAlt = MIN_ALT / 2;   // background starts earlier and spawns 2x as often
  }

  _rand()            { return this._rng(); }
  _randFloat(a, b)   { return a + this._rng() * (b - a); }

  update(altitude) {
    // Spawn foreground asteroids
    while (altitude >= this._nextFgAlt) {
      this._spawn(true);
      const t = Math.min(1, (this._nextFgAlt - MIN_ALT) / 2000);
      const interval = BASE_INTERVAL - t * (BASE_INTERVAL - MIN_INTERVAL);
      this._nextFgAlt += Math.round(interval);
    }

    // Spawn background asteroids at 2x frequency
    while (altitude >= this._nextBgAlt) {
      this._spawn(false);
      const t = Math.min(1, Math.max(0, this._nextBgAlt - MIN_ALT / 2) / 2000);
      const interval = (BASE_INTERVAL - t * (BASE_INTERVAL - MIN_INTERVAL)) / 2;
      this._nextBgAlt += Math.round(interval);
    }

    // Update and clean up asteroids
    const cam = this.scene.cameras.main;
    const camTop = cam.scrollY - 200;
    const camBot = cam.scrollY + cam.height + 200;
    const W = this.scene.scale.width;

    for (let i = this._asteroids.length - 1; i >= 0; i--) {
      const a = this._asteroids[i];

      if (a.fg && a.body && !a.destroyed) {
        // Apply 25% of world gravity manually (ignoreGravity is true)
        const grav = this.scene.matter.world.engine.gravity;
        Phaser.Physics.Matter.Matter.Body.applyForce(
          a.sprite.body,
          a.sprite.body.position,
          { x: 0, y: grav.y * grav.scale * a.sprite.body.mass * 0.25 }
        );
        // Clean up when off-screen
        if (a.sprite.y > camBot + 100 || a.sprite.y < camTop - 100 ||
            a.sprite.x < -200 || a.sprite.x > W + 200) {
          this._destroyAsteroid(a, i);
        }
      } else if (!a.fg) {
        // Background asteroids move manually (no physics)
        a.sprite.x += a.vx;
        a.sprite.y += a.vy;
        if (a.sprite.y > camBot + 100 || a.sprite.y < camTop - 100 ||
            a.sprite.x < -200 || a.sprite.x > W + 200) {
          a.sprite.destroy();
          this._asteroids.splice(i, 1);
        }
      }
    }
  }

  _spawn(isFg) {
    const cam = this.scene.cameras.main;
    const W = this.scene.scale.width;

    // Enter from left or right
    const fromLeft = this._rand() < 0.5;
    const x = fromLeft ? -30 : W + 30;

    // Spawn above the camera view
    const y = cam.scrollY - 20 - this._rand() * 100;

    // Speed increases with altitude
    const currentAlt = isFg ? this._nextFgAlt : this._nextBgAlt;
    const altT = Math.min(1, Math.max(0, currentAlt - MIN_ALT) / 2000);
    const speed = SPEED_BASE + this._randFloat(0, SPEED_MAX_ADD * (0.3 + altT * 0.7));
    const angle = this._randFloat(0.6, 1.0); // ~35°-57° from horizontal, closer to 45°
    const vx = (fromLeft ? 1 : -1) * Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    if (isFg) {
      this._spawnForeground(x, y, vx, vy);
    } else {
      this._spawnBackground(x, y, vx, vy, fromLeft);
    }
  }

  _spawnForeground(x, y, vx, vy) {
    const sprite = this.scene.matter.add.image(x, y, 'asteroid_fg', null, {
      shape: 'circle',
      circleRadius: 12 * SCALE,
      label: 'asteroid',
      restitution: 0.2,
      friction: 0.8,
      frictionAir: 0,
      mass: 5,
      ignoreGravity: true,  // we apply partial gravity manually
    }).setScale(SCALE);

    sprite.setVelocity(vx, vy);
    sprite.setAngularVelocity(this._randFloat(-0.05, 0.05));

    const entry = { sprite, fg: true, body: sprite.body, destroyed: false };
    this._asteroids.push(entry);
  }

  _spawnBackground(x, y, vx, vy, fromLeft) {
    const sprite = this.scene.add.image(x, y, 'asteroid_bg')
      .setScale(SCALE * 0.7)
      .setAlpha(0.7)
      .setDepth(-1);

    // Flip based on direction for variety
    if (!fromLeft) sprite.setFlipX(true);

    const entry = { sprite, fg: false, vx, vy };
    this._asteroids.push(entry);
  }

  _destroyAsteroid(a, idx) {
    if (a.sprite.body) {
      this.scene.matter.world.remove(a.sprite.body);
    }
    a.sprite.destroy();
    this._asteroids.splice(idx, 1);
  }

  destroyOnPlayerHit(asteroidBody) {
    const idx = this._asteroids.findIndex(a =>
      a.fg && a.body && a.body.id === asteroidBody.id
    );
    if (idx === -1) return;
    const a = this._asteroids[idx];
    a.destroyed = true;
    this._destroyAsteroid(a, idx);
  }
}
