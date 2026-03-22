// Platform frame layout in platform_tiles.png (16x8 per frame):
// Row 0 (fuel):   0=left cap, 1=middle, 2=right cap
// Row 1 (points): 3=left cap, 4=middle, 5=right cap
const FRAME_OFFSETS = { fuel: 0, points: 3 };
const SHIELD_COLOR = 0x44aaff;

// Collision categories
export const CAT_DEFAULT  = 0x0001;
export const CAT_SHIELD   = 0x0002;
export const CAT_PLAYER   = 0x0004;
export const CAT_ASTEROID = 0x0008;

export default class Platform extends Phaser.GameObjects.Rectangle {
  constructor(scene, x, y, width, type) {
    // Invisible rectangle for the physics body
    super(scene, x, y, width, 8, 0x000000, 0);
    this.platformType = type;
    this.collected = false;

    const base = FRAME_OFFSETS[type] ?? 0;
    const CAP_W = 16; // source cap width in pixels
    const halfW = width / 2;

    // Middle tiled section — only fills the gap between the two caps
    const midW = Math.max(0, width - CAP_W * 2);
    const mid = scene.add.tileSprite(x, y, midW, 8, 'platform_tiles', base + 1)
      .setOrigin(0.5);
    this._mid = mid;

    // Left and right end caps at the very edges
    const left = scene.add.image(x - halfW, y, 'platform_tiles', base)
      .setOrigin(0, 0.5);
    const right = scene.add.image(x + halfW, y, 'platform_tiles', base + 2)
      .setOrigin(1, 0.5);
    this._left = left;
    this._right = right;

    // ── Shield dome (half-circle above platform) ─────────────
    const radius = Math.max(width * 0.65, 50);
    this._shieldRadius = radius;

    // Build half-circle vertices (dome above the platform)
    const N = 12;
    const verts = [];
    // Bottom-right corner
    verts.push({ x: radius, y: 0 });
    // Arc from right to left (π=0 to π)
    for (let i = 0; i <= N; i++) {
      const a = Math.PI * i / N;
      verts.push({ x: Math.cos(a) * radius, y: -Math.sin(a) * radius });
    }
    // Bottom-left corner
    verts.push({ x: -radius, y: 0 });

    // Shield graphics — subtle idle shimmer
    this._shieldGfx = scene.add.graphics();
    this._shieldGfx.setDepth(-0.5);
    this._drawShield(0.08);

    // Sensor circle centered on the platform — detects asteroid overlap,
    // collision handler applies the bounce manually (only above the platform)
    this._shieldBody = scene.matter.add.circle(x, y, radius, {
      isSensor: true,
      isStatic: true,
      label: 'platformShield',
    });
    this._shieldBody.platform = this;

    // Matter body is added by WorldGen after creation
  }

  _drawShield(alpha) {
    const gfx = this._shieldGfx;
    const r = this._shieldRadius;
    gfx.clear();
    gfx.lineStyle(1.5, SHIELD_COLOR, alpha);
    gfx.beginPath();
    gfx.arc(this.x, this.y, r, Math.PI, 0, false);
    gfx.strokePath();
  }

  flashShield() {
    this._drawShield(0.7);
    if (this._shieldTween) this._shieldTween.stop();
    this._shieldTween = this.scene.tweens.addCounter({
      from: 0.7,
      to: 0.08,
      duration: 400,
      ease: 'Cubic.easeOut',
      onUpdate: (tween) => this._drawShield(tween.getValue()),
    });
  }

  setCollected() {
    this.collected = true;
    this._mid.setAlpha(0.4);
    this._left.setAlpha(0.4);
    this._right.setAlpha(0.4);
  }

  destroy() {
    if (this._mid) this._mid.destroy();
    if (this._left) this._left.destroy();
    if (this._right) this._right.destroy();
    if (this._shieldGfx) this._shieldGfx.destroy();
    if (this._shieldTween) this._shieldTween.stop();
    if (this._shieldBody) {
      this.scene?.matter?.world?.remove(this._shieldBody);
    }
    super.destroy();
  }
}
