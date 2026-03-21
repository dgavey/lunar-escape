import Player from '../objects/Player.js';
import WorldGen from '../utils/WorldGen.js';
import AsteroidSpawner from '../utils/AsteroidSpawner.js';

const CRASH_VELOCITY = 120;  // px/s = instant crash (lower for moon gravity)
const DEFAULT_SEED   = 0x3EF20;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  preload() {
    this.load.atlas('sprites', 'assets/ships.png', 'assets/spritesheet.json');
    this.load.spritesheet('star_tiles', 'assets/star_tiles.png', {
      frameWidth: 16, frameHeight: 16,
    });
    this.load.spritesheet('moon_tiles', 'assets/moon_tiles.png', {
      frameWidth: 16, frameHeight: 16,
    });
    this.load.spritesheet('platform_tiles', 'assets/platform_tiles.png', {
      frameWidth: 16, frameHeight: 8,
    });
    this.load.image('crystal', 'assets/crystal.png');
    this.load.image('asteroid_bg', 'assets/asteroid_bg.png');
    this.load.image('asteroid_fg', 'assets/asteroid_fg.png');
    this.load.image('surface_layer1', 'assets/surface_layer1.png');
    this.load.image('surface_layer2', 'assets/surface_layer2.png');
    this.load.image('surface_layer3', 'assets/surface_layer3.png');
    this.load.image('surface_layer4', 'assets/surface_layer4.png');
  }

  create() {
    this.bonusScore    = 0;
    this.altitudeScore = 0;
    this._gameOver     = false;
    this.launched      = false;
    this._landedPlatform = null;

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
    // Create player first, then position based on actual body offset
    this.player = new Player(this, playerX, 0);
    // Body bottom in vertex coords is FOOT_BOT_Y (27).
    // Body centroid offset is stored in _bodyOffsetY.
    const feetBelowCenter = 27 - this.player._bodyOffsetY;
    this._startY = padSurfaceY - 2 - feetBelowCenter;
    // Reposition the body to the correct start Y
    const MBody = Phaser.Physics.Matter.Matter.Body;
    MBody.setPosition(this.player.body, { x: playerX, y: this._startY });
    this.player.x = playerX;
    this.player.y = this._startY;
    // Start with gear deployed (sitting on pad)
    this.player.gearProgress = 1;
    this.player.gearDeployed = true;
    this.player.gearTarget = true;

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

    this.scene.launch('UIScene');

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

    // Asteroid hitting the player = game over
    const [playerBody, otherBody] = this._getPlayerAndOther(bodyA, bodyB);
    if (playerBody && otherBody.label === 'asteroid') {
      this.asteroidSpawner.destroyOnPlayerHit(otherBody);
      this._triggerGameOver('asteroid');
      return;
    }

    if (!playerBody) return;

    const isGround = otherBody.label === 'ground' || otherBody.label === 'platform';
    if (!isGround) return;

    // Only count as ground contact if player is above the surface
    if (playerBody.position.y >= otherBody.position.y) return;

    this.player._groundContactIds.add(otherBody.id);

    // Track which platform we're on
    const otherObj = otherBody.gameObject;
    if (otherObj?.platformType) {
      this._landedPlatform = otherObj;
    }

    // Crash check — use pre-collision velocity
    if (this.player.prevVelocityY > CRASH_VELOCITY) {
      this._triggerGameOver('crash');
    }

    // Crash if landing gear not fully deployed (skip before launch)
    // Only trigger on meaningful impacts, not gentle touches
    if (this.launched && !this.player.isGearFullyDeployed() && this.player.prevVelocityY > 50) {
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
    if (platform.platformType === 'fuel') {
      player.fuel = player.maxFuel;
      this._floatText(platform.x, platform.y - 20, 'FULL FUEL', '#00ff66');
    } else if (platform.platformType === 'points') {
      const pts = platform.pointValue || 500;
      this.bonusScore += pts;
      this._floatText(platform.x, platform.y - 20, `+${pts}`, '#ffdd00');
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
    this.altitudeScore = Math.max(0, Math.floor((this._startY - this.player.y) / 8));
    this.asteroidSpawner.update(this.altitudeScore);

    // ── Landing gear auto-deploy ────────────────────────────────
    this._updateGearProximity();

    // Debug: keep fuel full in god/noclip mode
    if (this._debugGod) this.player.fuel = this.player.maxFuel;

    // Collect crystals on contact
    const crystalPts = this.worldGen.collectCrystals(this.player.x, this.player.y);
    if (crystalPts > 0) {
      this.bonusScore += crystalPts;
      this._floatText(this.player.x, this.player.y - 30, `+${crystalPts}`, '#66eeff');
    }

    // Collect platform once the ship has settled upright on it
    if (this._landedPlatform && !this._landedPlatform.collected && this.player.isStable()) {
      this._collectPlatform(this.player, this._landedPlatform);
    }

    // Tipping game over — ship fell past the point of no return
    if (this.player.tippedOut) {
      this._triggerGameOver('tipped');
    }

    if (!this.launched && this.altitudeScore > 2) this.launched = true;

    // Camera: scroll up once the ship rises above the mid-point of the screen
    const FOLLOW_SCREEN_Y = this.scale.height * 0.5;
    const playerScreenY   = this.player.y - this.cameras.main.scrollY;
    if (playerScreenY < FOLLOW_SCREEN_Y) {
      const target = this.player.y - FOLLOW_SCREEN_Y;
      this.cameras.main.scrollY += (target - this.cameras.main.scrollY) * 0.1;
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

  _triggerGameOver(reason) {
    if (this._gameOver) return;
    this._gameOver = true;
    this.matter.world.pause();

    const total = this.getTotalScore();
    const prev  = parseInt(localStorage.getItem('lunarClimberHi') || '0');
    const hi    = Math.max(total, prev);
    if (total >= prev) localStorage.setItem('lunarClimberHi', String(total));

    this.events.emit('gameover', total, hi, reason);
  }
}
