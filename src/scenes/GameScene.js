import Player from '../objects/Player.js';
import WorldGen from '../utils/WorldGen.js';
import AsteroidSpawner from '../utils/AsteroidSpawner.js';
import AsteroidGlowPipeline from '../shaders/AsteroidGlowPipeline.js';
import ShieldGlowPipeline from '../shaders/ShieldGlowPipeline.js';
import CrystalBoostPipeline from '../shaders/CrystalBoostPipeline.js';

const CRASH_VELOCITY = 120;  // px/s = instant crash (lower for moon gravity)
const DEFAULT_SEED   = 0xFFE0;
const WIN_ALT        = 2500;

// Atmosphere zones — visual layers the player ascends through
const ZONES = [
  { name: 'SURFACE',       alt: 0,    color: null,     alpha: 0 },
  { name: 'LITHOSPHERE',   alt: 500,  color: 0x001133, alpha: 0.2 },
  { name: 'STELASPHERE',   alt: 1000, color: 0x110033, alpha: 0.3 },
  { name: 'HELIOSPHERE',   alt: 1500, color: 0x220011, alpha: 0.35 },
  { name: 'EXOSPHERE',     alt: 2000, color: 0x000000, alpha: 0.4 },
];

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    // Register shaders (idempotent — safe across restarts)
    const renderer = this.game.renderer;
    if (renderer?.pipelines) {
      if (!renderer.pipelines.has('AsteroidGlow')) {
        renderer.pipelines.addPostPipeline('AsteroidGlow', AsteroidGlowPipeline);
      }
      if (!renderer.pipelines.has('ShieldGlow')) {
        renderer.pipelines.addPostPipeline('ShieldGlow', ShieldGlowPipeline);
      }
      if (!renderer.pipelines.has('CrystalBoost')) {
        renderer.pipelines.addPostPipeline('CrystalBoost', CrystalBoostPipeline);
      }
    }

    this.bonusScore    = 0;
    this.altitudeScore = 0;
    this.currentAltitude = 0;
    this._gameOver     = false;
    this.launched      = false;
    this._offScreenTime = null;
    this._landedPlatform = null;
    this._currentZone  = 0;
    this._zoneOverlay  = null;
    this._zoneLabel    = null;

    this._createStars();

    // ── Moon surface (tiled ground) ────────────────────────────────
    const TILE = 16;
    const SCALE = 3;
    const TILE_S = TILE * SCALE;             // 48px per tile on screen
    const W = this.scale.width;              // 390
    const H = this.scale.height;             // 844
    const GROUND_ROWS = 4;                   // 4 rows of tiles = 192px of ground
    const EXTRA_BELOW = 2;                   // extra rows below canvas for camera offset
    const groundTopY = H - TILE_S * GROUND_ROWS; // top of tiled ground
    const cols = Math.ceil(W / TILE_S) + 2;  // tiles needed across (extra for edge coverage)

    this._createSurfaceBackgrounds(groundTopY, W, SCALE);
    this._createMoonSurface(cols, GROUND_ROWS + EXTRA_BELOW, groundTopY, TILE_S, TILE, SCALE);
    this._createSurfaceAccents(groundTopY, TILE_S, SCALE, cols);

    // Invisible physics body for the ground (at top of tiles)
    const groundY = groundTopY + 2;
    this._groundSurfaceY = groundY;
    const ground = this.add.rectangle(W / 2, groundY, W, 4, 0x000000, 0);
    this.matter.add.gameObject(ground, {
      isStatic: true,
      label: 'ground',
      friction: 0.8,
    });

    // ── Launch pad physics surface ─────────────────────────────
    // The pad tile's flat platform is at pixel row 10 of 16, scaled 3x = 30px from tile top
    const playerX = W / 2;                           // 195 — player spawn X
    const padTileY = groundTopY - TILE_S;            // tile placed 1 row above ground
    const padSurfaceY = padTileY + 10 * SCALE;       // row 10 at 3x scale
    const padBody = this.add.rectangle(playerX, padSurfaceY, TILE_S, 4, 0x000000, 0);
    this.matter.add.gameObject(padBody, {
      isStatic: true,
      label: 'ground',
      friction: 0.8,
    });

    // ── Player (sits on top of launch pad) ─────────────────────
    // Create player first, deploy gear, then position based on actual body offset
    this.player = new Player(this, playerX, 0);
    // Deploy gear before positioning so the body includes legs
    this.player.gearProgress = 1;
    this.player.gearDeployed = true;
    this.player.gearTarget = true;
    this.player._lastBodyGearT = -1; // force rebuild with legs
    this.player._buildAndSetBody(playerX, 0, 1);
    // Now position: body bottom (feet) in vertex coords depends on gear collision shape
    const feetBelowCenter = 27 - this.player._bodyOffsetY;
    this._startY = padSurfaceY + 5 - feetBelowCenter;
    const MBody = Phaser.Physics.Matter.Matter.Body;
    MBody.setPosition(this.player.body, { x: playerX, y: this._startY });
    this.player.x = playerX;
    this.player.y = this._startY;

    // ── Platforms (seeded world) ─────────────────────────────────
    this.worldSeed = window._pendingSeed ?? DEFAULT_SEED;
    delete window._pendingSeed;
    this.worldSeedHex = this.worldSeed.toString(16).toUpperCase();
    console.log(`World seed: 0x${this.worldSeedHex}`);
    this.worldGen = new WorldGen(this, this._startY, this.worldSeed);
    this.worldGen.init();

    // ── Asteroids ──────────────────────────────────────────────
    this.asteroidSpawner = new AsteroidSpawner(this, this.worldSeed);

    // ── Matter collision events ─────────────────────────────────
    this.matter.world.on('beforeupdate', () => {
      if (this.player?.body) {
        this.player.prevVelocityY = this.player.body.velocity.y * 60;
      }
    });

    this.matter.world.on('collisionstart', (event) => {
      for (const pair of event.pairs) {
        this._onCollisionStart(pair.bodyA, pair.bodyB);
      }
    });

    this.matter.world.on('collisionend', (event) => {
      for (const pair of event.pairs) {
        this._onCollisionEnd(pair.bodyA, pair.bodyB);
      }
    });

    // ── Camera ──────────────────────────────────────────────────
    this.cameras.main.scrollX = 0;
    this.cameras.main.scrollY = this._startY - (this.scale.height - 220);

    // ── Zone overlay (tinted full-screen rect, follows camera) ──
    this._zoneOverlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0)
      .setScrollFactor(0)
      .setDepth(-5);

    // ── Explosion animation ────────────────────────────────────
    this.anims.create({
      key: 'explode',
      frames: this.anims.generateFrameNumbers('explosion', { start: 0, end: 7 }),
      frameRate: 16,
      repeat: 0,
    });

    // ── Zone boundary markers in world space ──────────────────
    for (let i = 1; i < ZONES.length; i++) {
      const zoneY = this._startY - ZONES[i].alt * 8;
      // Dashed line across screen
      const lineGfx = this.add.graphics();
      lineGfx.lineStyle(1, 0x4466aa, 0.4);
      for (let dx = 0; dx < W; dx += 12) {
        lineGfx.beginPath();
        lineGfx.moveTo(dx, zoneY);
        lineGfx.lineTo(dx + 6, zoneY);
        lineGfx.strokePath();
      }
      // Zone name label at boundary
      this.add.text(W / 2, zoneY + 8, `── ${ZONES[i].name} ──`, {
        fontSize: '12px', color: '#4466aa', fontFamily: 'monospace',
        alpha: 0.6,
      }).setOrigin(0.5, 0);
    }

    // ── Sound effects ─────────────────────────────────────────
    this._sfxPickup = this.sound.add('sfx_pickup', { volume: 0.5 });
    this._sfxExplosion = this.sound.add('sfx_explosion', { volume: 0.6 });
    this._sfxThrust = this.sound.add('sfx_thrust', { volume: 0.45, loop: true });
    this._sfxRefuel = this.sound.add('sfx_refuel', { volume: 0.5 });
    this._sfxCrystalBoost = this.sound.add('sfx_crystal_boost', { volume: 0.4 });
    this._crystalBoostPlaying = false;
    this._thrustPlaying = false;
    this._thrustFadeTimer = null;

    this.scene.launch('UIScene');

    // Apply shield shader if starting with shields
    if (this.player.shieldCount > 0) this._updateShieldShader();

    // ── Debug console commands ───────────────────────────────────
    this._debugGod    = false;
    this._debugNoclip = false;

    window.god = () => {
      this._debugGod = true;
      if (this._debugNoclip) {
        this._debugNoclip = false;
        this.player._noclip = false;
        this.matter.world.add(this.player.body);
        Phaser.Physics.Matter.Matter.Body.setPosition(this.player.body,
          { x: this.player.x, y: this.player.y });
        this.player.setVelocity(0, 0);
      }
      console.log('GOD MODE: unlimited fuel');
    };
    window.noclip = () => {
      this._debugGod = true;
      this._debugNoclip = true;
      this.player._noclip = true;
      this.matter.world.remove(this.player.body);
      console.log('NOCLIP: fly freely, no collisions');
    };
    window.mortal = () => {
      this._debugGod = false;
      if (this._debugNoclip) {
        this._debugNoclip = false;
        this.player._noclip = false;
        this.matter.world.add(this.player.body);
        Phaser.Physics.Matter.Matter.Body.setPosition(this.player.body,
          { x: this.player.x, y: this.player.y });
        this.player.setVelocity(0, 0);
        this.player.setAngularVelocity(0);
      }
      console.log('MORTAL: back to normal');
    };
    this._debugDraw = false;
    this._debugGfx = null;
    window.debug = () => {
      this._debugDraw = !this._debugDraw;
      if (this._debugDraw) {
        this._debugGfx = this.add.graphics().setDepth(999);
        console.log('DEBUG: physics bodies visible');
      } else {
        if (this._debugGfx) { this._debugGfx.destroy(); this._debugGfx = null; }
        console.log('DEBUG: physics bodies hidden');
      }
    };
    window.seed = (hex) => {
      if (hex === undefined) {
        console.log(`Current seed: 0x${this.worldSeedHex}`);
        return `0x${this.worldSeedHex}`;
      }
      const val = parseInt(String(hex).replace(/^0x/i, ''), 16);
      if (isNaN(val)) { console.error('Invalid hex seed'); return; }
      window._pendingSeed = val;
      this.scene.stop('UIScene');
      this.scene.restart();
      console.log(`Restarting with seed: 0x${val.toString(16).toUpperCase()}`);
    };
  }

  _createStars() {
    const W = this.scale.width;
    const H = this.scale.height;
    const COUNT = 40;  // number of star tiles scattered

    this._starContainer = this.add.container(0, 0);
    for (let i = 0; i < COUNT; i++) {
      const frame = Phaser.Math.Between(0, 6);
      const scale = Phaser.Math.FloatBetween(1.5, 3);
      const yPos = Phaser.Math.Between(0, H);
      const tile = this.add.image(
        Phaser.Math.Between(0, W),
        yPos,
        'star_tiles', frame
      ).setScale(scale).setOrigin(0.5).setAlpha(Phaser.Math.FloatBetween(0.4, 1));
      tile.setData('baseY', yPos);
      this._starContainer.add(tile);
    }
    this._starContainer.setScrollFactor(0);
    this._starContainer.setDepth(-10);
  }

  _createMoonSurface(cols, rows, topY, tileS, tile, scale) {
    // Use a single uniform fill tile (frame 9) for a clean, consistent look
    const FILL = 9;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.add.image(c * tileS, topY + r * tileS, 'moon_tiles', FILL)
          .setOrigin(0, 0)
          .setScale(scale);
      }
    }
  }

  _createSurfaceAccents(groundTopY, tileS, scale, cols) {
    // Place building/structure accents on the surface
    const mid = Math.floor(cols / 2);

    // ── Launch pad (pixel-centered under player) ──────────────
    const W = this.scale.width;
    const padX = W / 2 - tileS / 2;  // center the tile on the player
    this._placeTile(padX, groundTopY - tileS, 32, scale);

    // ── Left side: comm tower + solar panel ──────────────────
    this._placeTile(0, groundTopY - tileS * 2, 48, scale);  // tower top
    this._placeTile(0, groundTopY - tileS, 40, scale);       // tower base
    this._placeTile(1 * tileS, groundTopY - tileS, 43, scale); // solar panel

    // ── Right side: solar panel + comm tower ─────────────────
    // Position from right edge of screen, inset by 1 tile so everything is visible
    const r = W - tileS;          // rightmost tile, fully on screen
    const r2 = W - tileS * 2;     // one tile further left

    this._placeTile(r2, groundTopY - tileS, 51, scale);      // solar panel (right)
    this._placeTile(r, groundTopY - tileS * 2, 48, scale);   // tower top
    this._placeTile(r, groundTopY - tileS, 40, scale);        // tower base
  }

  _placeTile(x, y, frame, scale) {
    this.add.image(x, y, 'moon_tiles', frame)
      .setOrigin(0, 0)
      .setScale(scale);
  }

  _createSurfaceBackgrounds(groundTopY, W, scale) {
    // Background layers are 128px wide source images, tiled across the screen
    // They sit just above the ground surface as parallax decoration
    // Layer1 (128x32): distant mountains — furthest back
    // Layer2 (128x32): mid-ground craters
    // Layer3 (128x64): closer terrain
    // Layer4 (128x64): foreground rocks

    const layers = [
      { key: 'surface_layer1', srcH: 32, scrollFactor: 0.95, alpha: 0.5 },
      { key: 'surface_layer2', srcH: 32, scrollFactor: 0.97, alpha: 0.6 },
      { key: 'surface_layer3', srcH: 64, scrollFactor: 0.98, alpha: 0.7 },
      { key: 'surface_layer4', srcH: 64, scrollFactor: 0.99, alpha: 0.8 },
    ];

    const tilesNeeded = Math.ceil(W / (128 * scale)) + 2;

    for (const layer of layers) {
      const yOffset = groundTopY - layer.srcH * scale;
      for (let i = 0; i < tilesNeeded; i++) {
        this.add.image(i * 128 * scale, yOffset, layer.key)
          .setOrigin(0, 0)
          .setScale(scale)
          .setScrollFactor(layer.scrollFactor)
          .setAlpha(layer.alpha);
      }
    }
  }

  // ── Matter collision helpers ────────────────────────────────────

  _isPlayerBody(body) {
    return body.label === 'player' || (body.parent && body.parent.label === 'player');
  }

  _getPlayerAndOther(bodyA, bodyB) {
    if (this._isPlayerBody(bodyA)) return [bodyA, bodyB];
    if (this._isPlayerBody(bodyB)) return [bodyB, bodyA];
    return [null, null];
  }

  _onCollisionStart(bodyA, bodyB) {
    if (this._gameOver) return;

    // Asteroid hitting the player
    const [playerBody, otherBody] = this._getPlayerAndOther(bodyA, bodyB);
    if (playerBody && otherBody.label === 'asteroid') {
      this.asteroidSpawner.destroyOnPlayerHit(otherBody);
      if (this._consumeShield()) return;
      this._triggerGameOver('asteroid');
      return;
    }

    // Asteroid hitting a platform shield — bounce away like a trampoline
    if (!playerBody) {
      let astBody = null, shieldBody = null;
      if (bodyA.label === 'asteroid' && bodyB.label === 'platformShield') { astBody = bodyA; shieldBody = bodyB; }
      if (bodyB.label === 'asteroid' && bodyA.label === 'platformShield') { astBody = bodyB; shieldBody = bodyA; }
      if (astBody && shieldBody) {
        // Only deflect if asteroid is above the platform (dome, not below)
        if (astBody.position.y < shieldBody.position.y) {
          const dx = astBody.position.x - shieldBody.position.x;
          const dy = astBody.position.y - shieldBody.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const speed = Math.sqrt(astBody.velocity.x ** 2 + astBody.velocity.y ** 2);
          const bounceSpeed = Math.max(speed, 3);
          Phaser.Physics.Matter.Matter.Body.setVelocity(astBody, {
            x: (dx / dist) * bounceSpeed,
            y: (dy / dist) * bounceSpeed,
          });
          if (shieldBody.platform) shieldBody.platform.flashShield();
        }
      }
      return;
    }

    const isGround = otherBody.label === 'ground' || otherBody.label === 'platform';
    if (!isGround) return;

    // Crash check for any high-speed impact (top, bottom, or side)
    const vx = this.player.body.velocity.x * 60;
    const vy = this.player.prevVelocityY;
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > CRASH_VELOCITY) {
      if (this._consumeShield()) return;
      this._triggerGameOver('crash');
      return;
    }

    // Only count as ground contact if player is above the surface
    if (playerBody.position.y >= otherBody.position.y) return;

    this.player._groundContactIds.add(otherBody.id);

    // Track which platform we're on
    const otherObj = otherBody.gameObject;
    if (otherObj?.platformType) {
      this._landedPlatform = otherObj;
    }

    // Crash if landing gear not fully deployed (skip before launch)
    // Only trigger on meaningful impacts, not gentle touches
    if (this.launched && !this.player.isGearFullyDeployed() && this.player.prevVelocityY > 50) {
      if (this._consumeShield()) return;
      this._triggerGameOver('gear');
    }
  }

  _onCollisionEnd(bodyA, bodyB) {
    const [playerBody, otherBody] = this._getPlayerAndOther(bodyA, bodyB);
    if (!playerBody) return;

    this.player._groundContactIds.delete(otherBody.id);

    if (this.player._groundContactIds.size === 0) {
      this._landedPlatform = null;
    }
  }

  // ── Platform collection ─────────────────────────────────────────

  _collectPlatform(player, platform) {
    platform.setCollected();
    // Landing bonus for all platforms
    const landingBonus = 250;
    this.bonusScore += landingBonus;

    if (platform.platformType === 'fuel') {
      player.fuel = player.maxFuel;
      this._sfxRefuel.play();
      this._floatText(platform.x, platform.y - 20, 'FULL FUEL', '#00ff66');
      this._floatText(platform.x, platform.y - 44, `+${landingBonus} LANDED`, '#ffdd00');
    } else if (platform.platformType === 'points') {
      this._sfxPickup.play();
      const pts = platform.pointValue || 500;
      this.bonusScore += pts;
      this._floatText(platform.x, platform.y - 20, `+${pts + landingBonus} LANDED`, '#ffdd00');
    } else {
      this._sfxPickup.play();
      this._floatText(platform.x, platform.y - 20, `+${landingBonus} LANDED`, '#ffdd00');
    }
  }

  _floatText(x, y, msg, color) {
    const t = this.add.text(x, y, msg, {
      fontSize: '18px', color,
      fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    this.tweens.add({
      targets: t, y: y - 60, alpha: 0, duration: 900,
      onComplete: () => t.destroy(),
    });
  }

  // ── Web Audio gain ramp (smooth, no per-frame stepping) ──────

  _rampThrustGain(target, duration) {
    // Use Phaser's Web Audio volumeNode for crackle-free gain ramping
    const snd = this._sfxThrust;
    if (snd.volumeNode) {
      const gain = snd.volumeNode.gain;
      const ctx = snd.volumeNode.context;
      gain.cancelScheduledValues(ctx.currentTime);
      gain.setValueAtTime(gain.value, ctx.currentTime);
      gain.linearRampToValueAtTime(target, ctx.currentTime + duration);
    } else {
      // Fallback for HTML5 audio
      snd.setVolume(target);
    }
  }

  // ── Landing gear proximity ────────────────────────────────────

  _updateGearProximity() {
    // Keep gear deployed while grounded — never retract on contact
    if (this.player.grounded) {
      this.player.setGearTarget(true);
      this._lastGroundedTime = this.time.now;
      return;
    }

    // Grace period after losing ground contact — prevents retraction from micro-bounces
    if (this._lastGroundedTime && this.time.now - this._lastGroundedTime < 300) {
      this.player.setGearTarget(true);
      return;
    }

    // Retract if moving upward
    if (this.player.body.velocity.y < -1) {
      this.player.setGearTarget(false);
      return;
    }

    // Body bottom (feet) in world coords
    const playerBottomY = this.player.y + (27 - this.player._bodyOffsetY);
    const DEPLOY_DIST = 50; // px below player to trigger gear deploy

    // Check distance to ground
    let nearestDist = this._groundSurfaceY - playerBottomY;

    // Check distance to all platforms (include slightly overlapping ones)
    for (const plat of this.worldGen._all) {
      const dist = plat.y - playerBottomY;
      if (dist > -10 && dist < nearestDist) {
        nearestDist = dist;
      }
    }

    this.player.setGearTarget(nearestDist < DEPLOY_DIST && nearestDist > -10);
  }

  // ── Wrap-around ───────────────────────────────────────────────

  _wrapPlayer() {
    const W = this.scale.width;
    const Body = Phaser.Physics.Matter.Matter.Body;

    if (this.player.x < 0) {
      Body.setPosition(this.player.body, { x: W, y: this.player.y });
    } else if (this.player.x > W) {
      Body.setPosition(this.player.body, { x: 0, y: this.player.y });
    }
  }

  // ── Zone management ──────────────────────────────────────────

  _updateZone() {
    // Determine which zone the player is in
    let zoneIdx = 0;
    for (let i = ZONES.length - 1; i >= 0; i--) {
      if (this.altitudeScore >= ZONES[i].alt) {
        zoneIdx = i;
        break;
      }
    }

    if (zoneIdx !== this._currentZone) {
      this._currentZone = zoneIdx;
      const zone = ZONES[zoneIdx];

      // Fade in overlay tint over 2 seconds
      if (zone.color !== null) {
        this._zoneOverlay.setFillStyle(zone.color, zone.alpha);
        this._zoneOverlay.setAlpha(0);
        this.tweens.add({
          targets: this._zoneOverlay,
          alpha: 1,
          duration: 2000,
          ease: 'Sine.easeInOut',
        });
      } else {
        this.tweens.add({
          targets: this._zoneOverlay,
          alpha: 0,
          duration: 2000,
          ease: 'Sine.easeInOut',
        });
      }

      // Announce zone entry
      if (zoneIdx > 0) {
        this.events.emit('zone', zone.name);
        const W = this.scale.width;
        const txt = this.add.text(W / 2, this.player.y - 60, zone.name, {
          fontSize: '28px', color: '#88aaff', fontFamily: 'monospace',
          stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(10);
        this.tweens.add({
          targets: txt, alpha: 0, y: txt.y - 80, duration: 2000,
          onComplete: () => txt.destroy(),
        });
      }
    }
  }

  // ── Main update ───────────────────────────────────────────────

  update(time, delta) {
    if (this._gameOver) return;

    this.cameras.main.scrollX = 0;
    if (this._starContainer) {
      // Subtle parallax — shift stars and wrap vertically so they always fill the screen
      const H = this.scale.height;
      const offset = -(this.cameras.main.scrollY * 0.05);
      this._starContainer.list.forEach(star => {
        const shifted = ((star.getData('baseY') + offset) % H + H) % H;
        star.y = shifted;
      });
    }
    if (!this.player._noclip) this._wrapPlayer();
    this.player.update(time, delta);
    this.worldGen.update(this.player.y);
    this.currentAltitude = Math.max(0, Math.floor((this._startY - this.player.y) / 8));
    this.altitudeScore = Math.max(this.altitudeScore, this.currentAltitude);
    this.asteroidSpawner.update(this.altitudeScore, time);

    // ── Landing gear auto-deploy ────────────────────────────────
    this._updateGearProximity();

    // ── Thrust sound ────────────────────────────────────────────
    if (this.player.isThrusting && !this._thrustPlaying) {
      // Cancel any pending fade-out stop
      if (this._thrustFadeTimer) {
        this._thrustFadeTimer.remove(false);
        this._thrustFadeTimer = null;
      }
      if (this._sfxThrust.isPlaying) {
        // Still playing (mid-fade) — just ramp gain back up, no restart
        this._rampThrustGain(0.45, 0.03);
      } else {
        this._sfxThrust.play();
        this._rampThrustGain(0.45, 0.03);
      }
      this._thrustPlaying = true;
    } else if (!this.player.isThrusting && this._thrustPlaying) {
      this._thrustPlaying = false;
      // Smooth fade via Web Audio gain node — no per-frame stepping
      this._rampThrustGain(0, 0.15);
      this._thrustFadeTimer = this.time.delayedCall(160, () => {
        this._sfxThrust.stop();
        this._thrustFadeTimer = null;
      });
    }

    // Debug: keep fuel full in god/noclip mode
    if (this._debugGod) this.player.fuel = this.player.maxFuel;

    // Collect crystals / triforces / shields on contact
    const pickup = this.worldGen.collectCrystals(this.player.x, this.player.y);
    if (pickup.points > 0) {
      this._sfxPickup.play();
      if (pickup.boost >= 10) {
        // Super crystal (triforce) — play full crystal boost sound
        this._sfxCrystalBoost.stop();
        this._sfxCrystalBoost.setVolume(0.4);
        this._sfxCrystalBoost.play();
        this._crystalBoostPlaying = true;
      }
      this.bonusScore += pickup.points;
      this.player.crystalBoostTimer = pickup.boost;
      const color = pickup.boost >= 10 ? '#ffee00' : '#66eeff';
      this._floatText(this.player.x, this.player.y - 30, `+${pickup.points}`, color);
    }
    if (pickup.shield) {
      this._sfxPickup.play();
      this.player.shieldCount++;
      this._updateShieldShader();
      this._floatText(this.player.x, this.player.y - 50, 'SHIELD', '#44ff88');
    }

    // Crystal boost sound fade-out when boost expires
    if (this.player.crystalBoostTimer <= 0 && this._crystalBoostPlaying) {
      this._crystalBoostPlaying = false;
      this.tweens.add({
        targets: this._sfxCrystalBoost,
        volume: 0,
        duration: 200,
        onComplete: () => this._sfxCrystalBoost.stop(),
      });
    }
    this._updateCrystalBoostShader();

    // Collect platform once the ship has settled upright on it
    if (this._landedPlatform && !this._landedPlatform.collected && this.player.isStable()) {
      this._collectPlatform(this.player, this._landedPlatform);
    }

    // Tipping game over — ship fell past the point of no return
    if (this.player.tippedOut) {
      if (!this._consumeShield()) this._triggerGameOver('tipped');
    }

    if (!this.launched && this.altitudeScore > 2) this.launched = true;

    // ── Zone transitions ──────────────────────────────────────
    this._updateZone();

    // ── Win condition ─────────────────────────────────────────
    if (this.altitudeScore >= WIN_ALT) {
      this._triggerGameOver('escaped');
      return;
    }

    // Camera: scroll up once the ship rises above the mid-point of the screen
    const FOLLOW_SCREEN_Y = this.scale.height * 0.5;
    const playerScreenY   = this.player.y - this.cameras.main.scrollY;
    if (playerScreenY < FOLLOW_SCREEN_Y) {
      const target = this.player.y - FOLLOW_SCREEN_Y;
      this.cameras.main.scrollY += (target - this.cameras.main.scrollY) * 0.1;
    }

    // Game over if player falls below screen for more than 1 second
    const camBottom = this.cameras.main.scrollY + this.scale.height;
    if (this.launched && this.player.y > camBottom) {
      if (!this._offScreenTime) {
        this._offScreenTime = this.time.now;
      } else if (this.time.now - this._offScreenTime >= 1000) {
        this._triggerGameOver('crash');
      }
    } else {
      this._offScreenTime = null;
    }

    // Game over 1.5s after running out of fuel
    if (this.player.fuel <= 0 && this.launched) {
      if (!this._fuelEmptyTime) {
        this._fuelEmptyTime = this.time.now;
      } else if (this.time.now - this._fuelEmptyTime >= 1500) {
        this._triggerGameOver('fuel');
      }
    } else {
      this._fuelEmptyTime = null;
    }

    // Debug: draw physics body wireframes
    if (this._debugDraw && this._debugGfx) {
      this._drawDebugBodies();
    }
  }

  _drawDebugBodies() {
    const g = this._debugGfx;
    g.clear();
    const bodies = this.matter.world.engine.world.bodies;
    for (const body of bodies) {
      // For compound bodies, draw each child part (skip parts[0] which is the convex hull parent)
      const partsToDraw = (body.parts && body.parts.length > 1)
        ? body.parts.slice(1)  // skip parent hull, draw only actual collision parts
        : [body];

      for (const part of partsToDraw) {
        const verts = part.vertices;
        if (!verts || verts.length < 2) continue;
        const color = body.label === 'player' ? 0x00ff00
                    : body.label === 'asteroid' ? 0xff0000
                    : body.label === 'platform' ? 0xffff00
                    : 0x4488ff;
        g.lineStyle(1, color, 0.8);
        g.beginPath();
        g.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) {
          g.lineTo(verts[i].x, verts[i].y);
        }
        g.closePath();
        g.strokePath();
      }
    }
  }

  // ── Scoring / game over ───────────────────────────────────────

  getTotalScore() {
    return this.altitudeScore + this.bonusScore;
  }

  _consumeShield() {
    if (this.player.shieldCount <= 0) return false;
    this.player.shieldCount--;
    this._updateShieldShader();
    this._sfxExplosion.play();
    this._floatText(this.player.x, this.player.y - 50, 'SHIELD BREAK', '#44ff88');

    // Ease velocity to half over 300ms
    const body = this.player.body;
    const startVx = body.velocity.x;
    const startVy = body.velocity.y;
    const startAv = body.angularVelocity;
    const Body = Phaser.Physics.Matter.Matter.Body;
    const startTime = this.time.now;
    const duration = 300;

    const slowDown = () => {
      const elapsed = this.time.now - startTime;
      const p = Math.min(1, elapsed / duration);
      // Ease out quad
      const ease = 1 - (1 - p) * (1 - p);
      const factor = 1 - ease * 0.5; // lerp from 1.0 to 0.5
      Body.setVelocity(body, {
        x: startVx * factor,
        y: startVy * factor,
      });
      Body.setAngularVelocity(body, startAv * factor);
      if (p < 1) this.time.delayedCall(16, slowDown);
    };
    slowDown();

    // Reset tipped state so player can recover
    this.player.tippedOut = false;

    return true;
  }

  _updateCrystalBoostShader() {
    if (!this.game.renderer?.pipelines) return;
    const sprite = this.player.shipSprite;
    if (!sprite) return;
    const shouldShow = this.player.crystalBoostTimer > 0;
    const has = sprite.getPostPipeline && sprite.getPostPipeline('CrystalBoost').length > 0;
    if (shouldShow && !has) {
      sprite.setPostPipeline('CrystalBoost');
    } else if (!shouldShow && has) {
      sprite.removePostPipeline('CrystalBoost');
    }
  }

  _updateShieldShader() {
    if (!this.game.renderer?.pipelines) return;
    const targets = [this.player.shipSprite, this.player.gearGfx];
    const shouldShow = this.player.shieldCount > 0;
    for (const obj of targets) {
      if (!obj) continue;
      // Remove all existing shield pipelines first to avoid duplicates
      try { obj.removePostPipeline('ShieldGlow'); } catch (e) { /* ok */ }
      if (shouldShow) {
        obj.setPostPipeline('ShieldGlow');
      }
    }
  }

  _triggerGameOver(reason) {
    if (this._gameOver) return;
    this._gameOver = true;
    this.matter.world.pause();

    const total = this.getTotalScore();
    const prev  = parseInt(localStorage.getItem('lunarClimberHi') || '0');
    const hi    = Math.max(total, prev);
    if (total >= prev) localStorage.setItem('lunarClimberHi', String(total));

    // Stop looping sounds on game over
    if (this._crystalBoostPlaying) {
      this._sfxCrystalBoost.stop();
      this._crystalBoostPlaying = false;
    }
    if (this._thrustPlaying) {
      if (this._thrustFadeTimer) {
        this._thrustFadeTimer.remove(false);
        this._thrustFadeTimer = null;
      }
      this._rampThrustGain(0, 0.1);
      this.time.delayedCall(110, () => this._sfxThrust.stop());
      this._thrustPlaying = false;
    }

    const isCrash = ['crash', 'tipped', 'gear', 'asteroid'].includes(reason);
    if (isCrash) {
      this._sfxExplosion.play();
      // Hide ship and play explosion at its position
      this.player.shipSprite.setVisible(false);
      this.player.flameGfx.setVisible(false);
      this.player.gearGfx.setVisible(false);

      const boom = this.add.sprite(this.player.x, this.player.y, 'explosion')
        .setScale(3)
        .setDepth(10);
      boom.play('explode');
      boom.on('animationcomplete', () => boom.destroy());

      // Show end screen after explosion finishes
      this.time.delayedCall(1000, () => {
        this.events.emit('gameover', total, hi, reason);
      });
    } else {
      this.events.emit('gameover', total, hi, reason);
    }
  }
}
