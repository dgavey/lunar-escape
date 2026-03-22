// Button layout (390 x 844 canvas)
// Left side: two rotation buttons side by side [<< | >>]
// Right side: two thrust buttons side by side [HALF | FULL], connected
const BTN_PAD_Y   = 86;    // padding from bottom (clears iOS home indicator + browser chrome)
const BTN_H       = 72;
const BTN_Y       = 844 - BTN_H - BTN_PAD_Y;
const GAP         = 8;     // gap between left buttons

// Left rotation buttons
const ROT_W       = 84;
const ROT_LEFT_X  = 20;
const ROT_RIGHT_X = ROT_LEFT_X + ROT_W + GAP;

// Right thrust buttons (connected, no gap)
const THRUST_BTN_W = 78;
const THRUST_FULL_X  = 390 - 20 - THRUST_BTN_W;           // FULL on the right
const THRUST_HALF_X  = THRUST_FULL_X - THRUST_BTN_W;      // HALF on the left

function hitsRect(ptr, x, y, w, h) {
  return ptr.x >= x && ptr.x <= x + w && ptr.y >= y && ptr.y <= y + h;
}

export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene', active: false });
  }

  create() {
    const { width, height } = this.scale;

    // ── Fuel bar (vertical, top-right) ─────────────────────────────
    const TOP = 40; // inset from top edge
    const FUEL_W = 10;          // bar width
    const FUEL_H = 105;         // bar height
    const FUEL_X = width - 18;  // right edge inset
    const FUEL_Y = TOP;         // top of bar
    this.add.rectangle(FUEL_X, FUEL_Y + FUEL_H / 2, FUEL_W + 2, FUEL_H + 2, 0x222222, 0.6)
      .setOrigin(0.5).setScrollFactor(0);
    this.fuelFill = this.add.rectangle(FUEL_X, FUEL_Y, FUEL_W, FUEL_H, 0x00ff44, 0.75)
      .setOrigin(0.5, 0).setScrollFactor(0);
    this._fuelMaxH = FUEL_H;
    this._fuelY = FUEL_Y;
    this.add.text(FUEL_X, FUEL_Y + FUEL_H + 6, 'F', {
      fontSize: '10px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5, 0).setScrollFactor(0);

    // ── Shield count (top-left, under best score) ─────────────────
    this._shieldIcons = [];
    this._shieldIconBaseX = 20;
    this._shieldIconBaseY = TOP + 58;

    // ── Stats ─────────────────────────────────────────────────────
    this.altText   = this.add.text(10, TOP, 'ALT: 0m',  { fontSize: '15px', color: '#ffffff', fontFamily: 'monospace' }).setScrollFactor(0);
    this.scoreText = this.add.text(10, TOP + 18, 'SCORE: 0', { fontSize: '15px', color: '#ffdd00', fontFamily: 'monospace' }).setScrollFactor(0);
    const hi = localStorage.getItem('lunarClimberHi') || '0';
    this.add.text(10, TOP + 36, `BEST: ${hi}`, { fontSize: '13px', color: '#888888', fontFamily: 'monospace' }).setScrollFactor(0);

    // ── Launch hint ───────────────────────────────────────────────
    this.launchHint = this.add.text(width / 2, height * 0.32, 'HOLD THRUST TO LAUNCH', {
      fontSize: '22px', color: '#ffff00', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0);
    this.tweens.add({ targets: this.launchHint, alpha: 0.2, duration: 600, yoyo: true, repeat: -1 });

    // ── Control buttons ───────────────────────────────────────────
    this._btnGfx = this.add.graphics().setScrollFactor(0);
    this._btnPressed = { left: false, right: false, thrustFull: false, thrustStutter: false };
    this._drawButtons();

    // Labels for rotation buttons
    this.add.text(ROT_LEFT_X + ROT_W / 2, BTN_Y + BTN_H / 2, '<<', { fontSize: '26px', color: '#ffffff', fontFamily: 'monospace' }).setOrigin(0.5).setScrollFactor(0);
    this.add.text(ROT_RIGHT_X + ROT_W / 2, BTN_Y + BTN_H / 2, '>>', { fontSize: '26px', color: '#ffffff', fontFamily: 'monospace' }).setOrigin(0.5).setScrollFactor(0);

    // Labels for thrust buttons
    this.add.text(THRUST_HALF_X + THRUST_BTN_W / 2, BTN_Y + BTN_H / 2, 'HALF', { fontSize: '13px', color: '#ffffff', fontFamily: 'monospace' }).setOrigin(0.5).setScrollFactor(0);
    this.add.text(THRUST_FULL_X + THRUST_BTN_W / 2, BTN_Y + BTN_H / 2, 'FULL', { fontSize: '13px', color: '#ffffff', fontFamily: 'monospace' }).setOrigin(0.5).setScrollFactor(0);

    // ── Multitouch button input ───────────────────────────────────
    this.input.addPointer(2); // support up to 3 simultaneous touches

    this._pointerBtns = {}; // ptr.id → 'left'|'right'|'thrustFull'|'thrustStutter'|null

    this.input.on('pointerdown', (ptr) => {
      const which = this._classifyPointer(ptr);
      if (!which) return;
      this._pointerBtns[ptr.id] = which;
      this._syncBtns();
    });

    this.input.on('pointermove', (ptr) => {
      if (!(ptr.id in this._pointerBtns)) return;
      const prev = this._pointerBtns[ptr.id];
      // Allow sliding between thrust buttons
      if (prev === 'thrustFull' || prev === 'thrustStutter') {
        if (hitsRect(ptr, THRUST_HALF_X, BTN_Y, THRUST_BTN_W, BTN_H)) {
          this._pointerBtns[ptr.id] = 'thrustStutter';
          this._syncBtns();
        } else if (hitsRect(ptr, THRUST_FULL_X, BTN_Y, THRUST_BTN_W, BTN_H)) {
          this._pointerBtns[ptr.id] = 'thrustFull';
          this._syncBtns();
        }
      }
    });

    const release = (ptr) => {
      delete this._pointerBtns[ptr.id];
      this._syncBtns();
    };
    this.input.on('pointerup', release);
    this.input.on('pointercancel', release);

    // ── Game over event ───────────────────────────────────────────
    this.scene.get('GameScene').events.on('gameover', (score, hi, reason, alt, hiAlt, zoneName) => {
      this._showGameOver(score, hi, reason, alt, hiAlt, zoneName);
    });
  }

  _classifyPointer(ptr) {
    if (hitsRect(ptr, ROT_LEFT_X, BTN_Y, ROT_W, BTN_H)) return 'left';
    if (hitsRect(ptr, ROT_RIGHT_X, BTN_Y, ROT_W, BTN_H)) return 'right';
    if (hitsRect(ptr, THRUST_HALF_X, BTN_Y, THRUST_BTN_W, BTN_H)) return 'thrustStutter';
    if (hitsRect(ptr, THRUST_FULL_X, BTN_Y, THRUST_BTN_W, BTN_H)) return 'thrustFull';
    return null;
  }

  _syncBtns() {
    const vals = Object.values(this._pointerBtns);
    this._btnPressed.left          = vals.includes('left');
    this._btnPressed.right         = vals.includes('right');
    this._btnPressed.thrustFull    = vals.includes('thrustFull');
    this._btnPressed.thrustStutter = vals.includes('thrustStutter');

    this._drawButtons();

    const game = this.scene.get('GameScene');
    if (game?.player) {
      game.player._btnLeft    = this._btnPressed.left;
      game.player._btnRight   = this._btnPressed.right;
      game.player._btnThrust  = this._btnPressed.thrustFull;
      game.player._btnStutter = this._btnPressed.thrustStutter;
    }
  }

  _drawButtons() {
    const g = this._btnGfx;
    g.clear();

    // Left rotation buttons
    const rotBtns = [
      { x: ROT_LEFT_X, pressed: this._btnPressed.left },
      { x: ROT_RIGHT_X, pressed: this._btnPressed.right },
    ];
    for (const { x, pressed } of rotBtns) {
      g.fillStyle(pressed ? 0x6688aa : 0x223344, pressed ? 0.85 : 0.55);
      g.fillRoundedRect(x, BTN_Y, ROT_W, BTN_H, 8);
      g.lineStyle(1, pressed ? 0xaaccff : 0x445566, 0.8);
      g.strokeRoundedRect(x, BTN_Y, ROT_W, BTN_H, 8);
    }

    // Right thrust buttons — connected horizontally [HALF | FULL]
    const halfLit = this._btnPressed.thrustStutter;
    const fullLit = this._btnPressed.thrustFull;

    // HALF (left side, rounded left corners)
    g.fillStyle(halfLit ? 0x666622 : 0x222211, halfLit ? 0.85 : 0.55);
    g.fillRoundedRect(THRUST_HALF_X, BTN_Y, THRUST_BTN_W, BTN_H, { tl: 8, tr: 0, bl: 8, br: 0 });
    g.lineStyle(1, halfLit ? 0xaaaa44 : 0x444422, 0.8);
    g.strokeRoundedRect(THRUST_HALF_X, BTN_Y, THRUST_BTN_W, BTN_H, { tl: 8, tr: 0, bl: 8, br: 0 });

    // FULL (right side, rounded right corners)
    g.fillStyle(fullLit ? 0xaa6622 : 0x332211, fullLit ? 0.85 : 0.55);
    g.fillRoundedRect(THRUST_FULL_X, BTN_Y, THRUST_BTN_W, BTN_H, { tl: 0, tr: 8, bl: 0, br: 8 });
    g.lineStyle(1, fullLit ? 0xffaa44 : 0x554422, 0.8);
    g.strokeRoundedRect(THRUST_FULL_X, BTN_Y, THRUST_BTN_W, BTN_H, { tl: 0, tr: 8, bl: 0, br: 8 });

    // Divider line
    g.lineStyle(1, 0x666666, 0.5);
    g.beginPath();
    g.moveTo(THRUST_FULL_X, BTN_Y + 4);
    g.lineTo(THRUST_FULL_X, BTN_Y + BTN_H - 4);
    g.strokePath();
  }

  update() {
    const game = this.scene.get('GameScene');
    if (!game?.player) return;

    const pct = Phaser.Math.Clamp(game.player.fuel / game.player.maxFuel, 0, 1);
    const empty = this._fuelMaxH * (1 - pct);
    this.fuelFill.y = this._fuelY + empty;
    this.fuelFill.height = this._fuelMaxH * pct;
    const boosted = game.player.crystalBoostTimer > 0;
    this.fuelFill.fillColor = boosted ? 0x66eeff : pct > 0.3 ? 0x00ff44 : 0xff4400;
    const flash = boosted ? 0.6 + 0.35 * Math.sin(this.time.now * 0.008) : (pct > 0.3 ? 0.75 : 0.85);
    this.fuelFill.setAlpha(flash);

    this.altText.setText(`ALT: ${game.currentAltitude}m / ${2500}m`);
    this.scoreText.setText(`SCORE: ${game.getTotalScore()}`);

    // Shield icons
    const sc = game.player.shieldCount;
    while (this._shieldIcons.length < sc) {
      const i = this._shieldIcons.length;
      const icon = this.add.image(this._shieldIconBaseX + i * 16, this._shieldIconBaseY, 'shield_pickup')
        .setScale(0.8)
        .setScrollFactor(0);
      this._shieldIcons.push(icon);
    }
    while (this._shieldIcons.length > sc) {
      this._shieldIcons.pop().destroy();
    }

    if (game.launched && this.launchHint.visible) {
      this.launchHint.setVisible(false);
    }
  }

  _showGameOver(score, hi, reason, alt, hiAlt, zoneName) {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    this.add.rectangle(cx, cy, width, height, 0x000000, 0.75).setScrollFactor(0);

    const isWin = reason === 'escaped';
    const title = reason === 'escaped'  ? 'ESCAPED!'
                : reason === 'crash'    ? 'CRASHED!'
                : reason === 'tipped'  ? 'TIPPED OVER!'
                : reason === 'asteroid' ? 'CRASHED!'
                : reason === 'gear'    ? 'CRASHED!'
                : 'OUT OF FUEL';
    const color = isWin ? '#00ffaa'
                : (reason === 'crash' || reason === 'tipped' || reason === 'asteroid' || reason === 'gear')
                ? '#ff4444' : '#ff8800';

    let y = cy - 100;

    this.add.text(cx, y, title, {
      fontSize: '42px', color, fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0);
    y += 50;

    // Zone / sphere reached
    this.add.text(cx, y, zoneName, {
      fontSize: '16px', color: '#88aaff', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0);
    y += 36;

    // Score and Height — equal size and color
    this.add.text(cx, y, `SCORE: ${score}`, {
      fontSize: '26px', color: '#ffdd00', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0);
    y += 34;

    this.add.text(cx, y, `HEIGHT: ${alt}m`, {
      fontSize: '26px', color: '#ffdd00', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0);
    y += 38;

    // Best line: score | height
    this.add.text(cx, y, `BEST: ${hi}  |  ${hiAlt}m`, {
      fontSize: '18px', color: '#aaaaaa', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0);
    y += 28;

    if ((score >= hi && score > 0) || (alt >= hiAlt && alt > 0)) {
      this.add.text(cx, y, 'NEW BEST!', {
        fontSize: '18px', color: '#00ff88', fontFamily: 'monospace',
      }).setOrigin(0.5).setScrollFactor(0);
      y += 26;
    }

    // Show world seed so players can replay the same map
    const game = this.scene.get('GameScene');
    const seedHex = game?.worldSeedHex || '???';
    this.add.text(cx, y, `SEED: 0x${seedHex}`, {
      fontSize: '13px', color: '#555555', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0);
    y += 30;

    const btn = this.add.text(cx, y + 10, '[ PLAY AGAIN ]', {
      fontSize: '24px', color: '#ffffff', fontFamily: 'monospace',
      backgroundColor: '#333333', padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setColor('#ffff00'));
    btn.on('pointerout',  () => btn.setColor('#ffffff'));

    const restart = () => {
      this.scene.stop('UIScene');
      this.scene.stop('GameScene');
      this.scene.start('GameScene');
    };
    btn.on('pointerdown', restart);
  }
}
