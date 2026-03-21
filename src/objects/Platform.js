// Platform frame layout in platform_tiles.png (16x8 per frame):
// Row 0 (fuel):   0=left cap, 1=middle, 2=right cap
// Row 1 (points): 3=left cap, 4=middle, 5=right cap
const FRAME_OFFSETS = { fuel: 0, points: 3 };

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

    // Matter body is added by WorldGen after creation
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
    super.destroy();
  }
}
