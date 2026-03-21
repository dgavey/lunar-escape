// Player uses an invisible Rectangle with a Matter.js physics body.
// Matter handles all rotational physics natively:
//   - Contact friction prevents sliding
//   - Center of mass + gravity causes natural tipping on edges
//   - Angular damping controls oscillation
//
// A sprite image and flame Graphics are synced to position/angle every frame.
// The physics body is a compound shape: hull + two leg struts matching the lander silhouette.

const SHIP_SCALE = 1.5;       // 64×64 sprite scaled to ~96px
const SPRITE_ANGLE = -90;    // rotate sprite so nose points up (sheet has it facing right)
const TIP_GAME_OVER = 70;    // degrees from upright = game over
const GEAR_DEPLOY_TIME = 700; // ms to fully deploy/retract
const GEAR_LEG_SPREAD = 10;   // horizontal spread of leg feet from hinge

// Lander collision shape — drawn in PhysicsEditor on the 64x64 sprite,
// rotated 90° CCW (sprite faces right, game faces up), scaled by SHIP_SCALE (1.5).
// Leg collision shapes are generated dynamically based on gear deployment progress.
//
// Main hull (hexagon connecting cabin to leg tops)
const PART_HULL = [
  { x: 7.5, y: 15 }, { x: -7.5, y: 15 },
  { x: -18, y: 9 }, { x: -4.5, y: -18 },
  { x: 6, y: -18 }, { x: 18, y: 7.5 },
];

// Derived layout constants
const HULL_MID_Y = -2;       // approximate visual center of hull
const FOOT_BOT_Y = 27;       // lowest point of the body (foot pads)

function normalizeAngle(a) {
  a = ((a % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
}

export default class Player extends Phaser.GameObjects.Rectangle {
  constructor(scene, x, y) {
    super(scene, x, y, 36, 36);
    this.setVisible(false);

    this.maxFuel      = 100;
    this.fuel         = this.maxFuel;
    this.thrustPower  = 0.0003;  // gentle thrust, just above lunar gravity
    this.rotateSpeed  = 0.015;  // rad/step — deliberate rotation
    this.fuelBurnRate = 14;

    this.prevVelocityY = 0;     // px/s — set by GameScene beforeupdate
    this.tippedOut     = false;
    this.grounded      = false;
    this._groundContactIds = new Set();
    this._noclip       = false;

    // Landing gear state
    this.gearProgress  = 0;     // 0 = retracted, 1 = fully deployed
    this.gearTarget    = false; // true = should deploy, false = should retract
    this.gearDeployed  = false; // true only when gearProgress === 1

    scene.add.existing(this);

    // Create default body first (required by Phaser), then replace
    scene.matter.add.gameObject(this, { label: 'player' });

    this._lastBodyGearT = -1; // force initial build
    this._buildAndSetBody(x, y, 0);

    // Ship sprite from atlas (replaces old Graphics triangle)
    this.shipSprite = scene.add.image(x, y, 'sprites', 'ship_green_side')
      .setScale(SHIP_SCALE)
      .setOrigin(0.5, 0.5);

    // Flame is still procedurally drawn
    this.flameGfx = scene.add.graphics();

    // Landing gear drawn procedurally
    this.gearGfx = scene.add.graphics();

    this.cursors = scene.input.keyboard.addKeys({
      left:   Phaser.Input.Keyboard.KeyCodes.LEFT,
      right:  Phaser.Input.Keyboard.KeyCodes.RIGHT,
      thrust: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });

    this._btnLeft   = false;
    this._btnRight  = false;
    this._btnThrust = false;
  }

  _computeCentroid(verts) {
    let cx = 0, cy = 0;
    for (const v of verts) { cx += v.x; cy += v.y; }
    return { x: cx / verts.length, y: cy / verts.length };
  }

  _getLegVerts(t) {
    if (t < 0.05) return null;
    // Interpolate leg collision shapes between retracted (flush with hull) and deployed.
    // Scaled to 80% of original to match the shortened visual gear.
    const S = 0.8; // scale factor matching visual gear reduction
    const outerXL = -12 + (-10.5 * S) * t;  // left outer x
    const outerXR =  12 + ( 10.5 * S) * t;  // right outer x
    const botY    = 12 + (12 * S) * t;        // bottom y for both legs
    return {
      left: [
        { x: outerXL, y: botY },                               // outer-bottom (foot)
        { x: outerXL, y: 15 + ((9 - 15) * S) * t },           // outer-top
        { x: -7.5, y: 15 },                                    // inner-top (hinge)
        { x: -7.5, y: botY },                                  // inner-bottom
      ],
      right: [
        { x: 7.5, y: 15 },                                     // inner-top (hinge)
        { x: outerXR, y: 15 + ((7.5 - 15) * S) * t },         // outer-top
        { x: outerXR, y: botY },                                // outer-bottom (foot)
        { x: 7.5, y: botY },                                   // inner-bottom
      ],
    };
  }

  _buildAndSetBody(x, y, t) {
    const Bodies = Phaser.Physics.Matter.Matter.Bodies;
    const Body   = Phaser.Physics.Matter.Matter.Body;

    const physOpts = {
      friction: 0.9,
      frictionStatic: 3,
      frictionAir: 0.005,
      restitution: 0.08,
      density: 0.001,
      label: 'player',
    };

    const hull = Bodies.fromVertices(x, y, [PART_HULL], physOpts);
    const hullCentroid = this._computeCentroid(PART_HULL);
    const parts = [hull];

    const legs = this._getLegVerts(t);
    if (legs) {
      const leftLeg  = Bodies.fromVertices(x, y, [legs.left], physOpts);
      const rightLeg = Bodies.fromVertices(x, y, [legs.right], physOpts);

      // fromVertices can return undefined if the shape is too small/degenerate
      if (leftLeg && rightLeg) {
        const llC = this._computeCentroid(legs.left);
        const rlC = this._computeCentroid(legs.right);

        Body.setPosition(leftLeg, {
          x: hull.position.x + (llC.x - hullCentroid.x),
          y: hull.position.y + (llC.y - hullCentroid.y),
        });
        Body.setPosition(rightLeg, {
          x: hull.position.x + (rlC.x - hullCentroid.x),
          y: hull.position.y + (rlC.y - hullCentroid.y),
        });

        parts.push(leftLeg, rightLeg);
      }
    }

    const landerBody = Body.create({ parts, ...physOpts });
    for (const part of landerBody.parts) part.label = 'player';
    this.setExistingBody(landerBody);

    this._bodyOffsetX = landerBody.position.x - x;
    this._bodyOffsetY = landerBody.position.y - y;
    this._lastBodyGearT = t;
  }

  _rebuildBodyForGear() {
    const t = this.gearProgress;
    const effectiveT = t < 0.05 ? 0 : t;
    const lastEffective = this._lastBodyGearT < 0.05 ? 0 : this._lastBodyGearT;

    // Only rebuild if changed enough (avoids per-frame body recreation)
    if (Math.abs(effectiveT - lastEffective) < 0.08) return;

    // Don't rebuild while grounded — swapping the body invalidates contact IDs
    // which causes grounded to flicker and the gear to retract
    if (this.grounded) return;

    // Save physics state
    const oldAngle = this.body.angle;
    const vel = { x: this.body.velocity.x, y: this.body.velocity.y };
    const angVel = this.body.angularVelocity;

    // Compute current sprite position (hull visual center in world space)
    const oldOffY = HULL_MID_Y - this._bodyOffsetY;
    const oldSpriteX = this.x + Math.sin(oldAngle) * (-oldOffY);
    const oldSpriteY = this.y + Math.cos(oldAngle) * oldOffY;

    // Build new body at origin, then reposition
    this._buildAndSetBody(0, 0, effectiveT);

    // Compute target body position so sprite stays in the same world position
    const newOffY = HULL_MID_Y - this._bodyOffsetY;
    const targetX = oldSpriteX - Math.sin(oldAngle) * (-newOffY);
    const targetY = oldSpriteY - Math.cos(oldAngle) * newOffY;

    const Body = Phaser.Physics.Matter.Matter.Body;
    Body.setPosition(this.body, { x: targetX, y: targetY });
    Body.setAngle(this.body, oldAngle);
    Body.setVelocity(this.body, vel);
    Body.setAngularVelocity(this.body, angVel);
  }

  addFuel(amount) {
    this.fuel = Math.min(this.maxFuel, this.fuel + amount);
  }

  _drawFlame(on) {
    this.flameGfx.clear();
    if (!on) return;
    const len = 16 + Phaser.Math.Between(0, 8);
    this.flameGfx.fillStyle(0xff6600, 0.95);
    this.flameGfx.fillTriangle(-5, 12, 5, 12, 0, 12 + len);
    this.flameGfx.fillStyle(0xffff00, 0.7);
    this.flameGfx.fillTriangle(-3, 12, 3, 12, 0, 12 + len * 0.55);
  }

  setGearTarget(deploy) {
    this.gearTarget = deploy;
  }

  isGearFullyDeployed() {
    return this.gearProgress >= 1;
  }

  _updateGear(dt) {
    if (this.gearTarget && this.gearProgress < 1) {
      this.gearProgress = Math.min(1, this.gearProgress + dt / (GEAR_DEPLOY_TIME / 1000));
    } else if (!this.gearTarget && this.gearProgress > 0) {
      this.gearProgress = Math.max(0, this.gearProgress - dt / (GEAR_DEPLOY_TIME / 1000));
    }
    this.gearDeployed = this.gearProgress >= 1;
    this._rebuildBodyForGear();
  }

  _drawGear() {
    this.gearGfx.clear();
    if (this.gearProgress <= 0) return;

    const t = this.gearProgress;
    // All coords relative to sprite center in world pixels.
    // Hinge points: at the visual bottom of the ship sprite
    // (sprite is 64x64 at origin 0.5, rotated -90°, scaled 1.5x — bottom ≈ y=10)
    const hingeY  = 10;
    const hingeXL = -10;
    const hingeXR =  10;

    // Foot targets — match collision body feet (in world pixels from sprite center)
    // Collision feet at t=1: y = (15 + 12*0.8) - HULL_MID_Y = 24.6 + 2 = 26.6
    const targetFootY = 20;
    const footOuterL = -16;
    const footOuterR =  16;
    const footLX = hingeXL + (footOuterL - hingeXL) * t;
    const footRX = hingeXR + (footOuterR - hingeXR) * t;
    const footY  = hingeY + (targetFootY - hingeY) * t;

    // Strut lines — from hinge to foot
    this.gearGfx.lineStyle(2, 0x888888, 1);
    this.gearGfx.beginPath();
    this.gearGfx.moveTo(hingeXL, hingeY);
    this.gearGfx.lineTo(footLX, footY);
    this.gearGfx.strokePath();
    this.gearGfx.beginPath();
    this.gearGfx.moveTo(hingeXR, hingeY);
    this.gearGfx.lineTo(footRX, footY);
    this.gearGfx.strokePath();

    // Foot pads
    const padW = 4;
    this.gearGfx.lineStyle(2, 0xaaaaaa, 1);
    this.gearGfx.beginPath();
    this.gearGfx.moveTo(footLX - padW, footY);
    this.gearGfx.lineTo(footLX + padW, footY);
    this.gearGfx.strokePath();
    this.gearGfx.beginPath();
    this.gearGfx.moveTo(footRX - padW, footY);
    this.gearGfx.lineTo(footRX + padW, footY);
    this.gearGfx.strokePath();
  }

  isStable() {
    return (
      this.grounded &&
      Math.abs(this.body.angularVelocity) < 0.008 &&
      Math.abs(this.body.velocity.x) < 0.3 &&
      Math.abs(this.body.velocity.y) < 0.3 &&
      Math.abs(normalizeAngle(this.angle)) < 8
    );
  }

  update(time, delta) {
    const dt = delta / 1000;
    const rotLeft   = this.cursors.left.isDown  || this._btnLeft;
    const rotRight  = this.cursors.right.isDown || this._btnRight;
    const thrusting = (this.cursors.thrust.isDown || this._btnThrust) && this.fuel > 0;

    this.grounded = this._groundContactIds.size > 0;

    // Safety: clear stale ground contacts if moving upward fast
    if (this.body && this.body.velocity.y < -1) {
      this._groundContactIds.clear();
      this.grounded = false;
    }

    // ── Noclip mode ────────────────────────────────────────────
    if (this._noclip) {
      const speed = 400 * dt;
      if (rotLeft)   this.x -= speed;
      if (rotRight)  this.x += speed;
      if (thrusting) this.y -= speed;
      else           this.y -= speed * 0.5;

      this.shipSprite.setPosition(this.x, this.y).setAngle(SPRITE_ANGLE);
      this.flameGfx.setPosition(this.x, this.y).setAngle(0);
      this._drawFlame(false);
      return;
    }

    // ── Rotation — only when airborne ─────────────────────────
    if (!this.grounded) {
      const av = this.body.angularVelocity;
      if (rotLeft)       this.setAngularVelocity(av - this.rotateSpeed * 0.15);
      else if (rotRight) this.setAngularVelocity(av + this.rotateSpeed * 0.15);
      else               this.setAngularVelocity(av * 0.9); // dampen when not pressing
      this.tippedOut = false;
    } else {
      // On ground — check for tipping past point of no return
      if (Math.abs(normalizeAngle(this.angle)) > TIP_GAME_OVER) {
        this.tippedOut = true;
      }
    }

    // ── Thrust ─────────────────────────────────────────────────
    if (thrusting) {
      const rad = this.rotation - Math.PI / 2;
      this.applyForce({
        x: Math.cos(rad) * this.thrustPower,
        y: Math.sin(rad) * this.thrustPower,
      });
      this.fuel = Math.max(0, this.fuel - this.fuelBurnRate * dt);
    }

    // ── Clamp max velocity ─────────────────────────────────────
    const vx = this.body.velocity.x;
    const vy = this.body.velocity.y;
    const maxH = 1.5; // ~90 px/s horizontal
    const maxV = 5;   // ~300 px/s vertical
    const clampedVx = Phaser.Math.Clamp(vx, -maxH, maxH);
    const clampedVy = Phaser.Math.Clamp(vy, -maxV, maxV);
    if (clampedVx !== vx || clampedVy !== vy) {
      this.setVelocity(clampedVx, clampedVy);
    }

    // ── Landing gear ─────────────────────────────────────────
    this._updateGear(dt);

    // ── Sync visuals ───────────────────────────────────────────
    // Sprite center = hull midpoint (HULL_MID_Y) in vertex space
    // Body centroid is offset from our vertex origin by _bodyOffsetY
    const offY = HULL_MID_Y - this._bodyOffsetY;
    const bodyRad = this.rotation;
    const spriteX = this.x + Math.sin(bodyRad) * (-offY);
    const spriteY = this.y + Math.cos(bodyRad) * offY;

    this.shipSprite.setPosition(spriteX, spriteY).setAngle(this.angle + SPRITE_ANGLE);
    this.flameGfx.setPosition(spriteX, spriteY).setAngle(this.angle);
    this._drawFlame(thrusting);
    this.gearGfx.setPosition(spriteX, spriteY).setAngle(this.angle);
    this._drawGear();
  }
}
