// Button layout (390 x 844 canvas)
// Two buttons across the bottom: [ROT L] [ROT R]
// Thrust = both pressed simultaneously
const BTN_H      = 60;    // height
const BTN_PAD_Y  = 86;    // padding from bottom (clears iOS home indicator + browser chrome)
const BTN_Y      = 844 - BTN_H - BTN_PAD_Y; // top edge of buttons
const BTN_W      = 120;   // button width
const HALF_W     = 390 / 2; // center of each half
const BTN_LEFT   = { x: HALF_W / 2 - BTN_W / 2, w: BTN_W };           // centered in left half
const BTN_RIGHT  = { x: HALF_W + HALF_W / 2 - BTN_W / 2, w: BTN_W };  // centered in right half

function hits(ptr, btn) {
  return ptr.x >= btn.x && ptr.x <= btn.x + btn.w &&
         ptr.y >= BTN_Y  && ptr.y <= BTN_Y + BTN_H;
}

function hitsAny(ptr) {
  return ptr.y >= BTN_Y && ptr.y <= BTN_Y + BTN_H;
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

    // ── Stats ─────────────────────────────────────────────────────
    this.altText   = this.add.text(10, TOP, 'ALT: 0m',  { fontSize: '15px', color: '#ffffff', fontFamily: 'monospace' }).setScrollFactor(0);
    this.scoreText = this.add.text(10, TOP + 18, 'SCORE: 0', { fontSize: '15px', color: '#ffdd00', fontFamily: 'monospace' }).setScrollFactor(0);
    const hi = localStorage.getItem('lunarClimberHi') || '0';
    this.add.text(10, TOP + 36, `BEST: ${hi}`, { fontSize: '13px', color: '#888888', fontFamily: 'monospace' }).setScrollFactor(0);

    // ── Launch hint ───────────────────────────────────────────────
    this.launchHint = this.add.text(width / 2, height * 0.32, 'HOLD BOTH TO LAUNCH', {
      fontSize: '22px', color: '#ffff00', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0);
    this.tweens.add({ targets: this.launchHint, alpha: 0.2, duration: 600, yoyo: true, repeat: -1 });

    // ── Control buttons ───────────────────────────────────────────
    this._btnGfx = this.add.graphics().setScrollFactor(0);
    this._btnPressed = { left: false, thrust: false, right: false };
    this._drawButtons();

    this.add.text(BTN_LEFT.x   + BTN_LEFT.w / 2,   BTN_Y + BTN_H / 2, '<<', { fontSize: '26px', color: '#ffffff', fontFamily: 'monospace' }).setOrigin(0.5).setScrollFactor(0);
    this.add.text(BTN_RIGHT.x  + BTN_RIGHT.w / 2,  BTN_Y + BTN_H / 2, '>>', { fontSize: '26px', color: '#ffffff', fontFamily: 'monospace' }).setOrigin(0.5).setScrollFactor(0);

    // ── Multitouch button input ───────────────────────────────────
    // Track by pointer id so simultaneous presses work correctly
    this.input.addPointer(2); // support up to 3 simultaneous touches

    this._pointerBtns = {}; // ptr.id → which btn it pressed ('left'|'right'|null)

    this.input.on('pointerdown', (ptr) => {
      if (!hitsAny(ptr)) return;
      const which = hits(ptr, BTN_LEFT) ? 'left'
        : hits(ptr, BTN_RIGHT)          ? 'right'
        : null;
      this._pointerBtns[ptr.id] = which;
      this._syncBtns();
    });

    const release = (ptr) => {
      delete this._pointerBtns[ptr.id];
      this._syncBtns();
    };
    this.input.on('pointerup', release);
    this.input.on('pointercancel', release);

    // ── Game over event ───────────────────────────────────────────
    this.scene.get('GameScene').events.on('gameover', (score, hi, reason) => {
      this._showGameOver(score, hi, reason);
    });
  }

  _syncBtns() {
    const vals = Object.values(this._pointerBtns);
    this._btnPressed.left   = vals.includes('left');
    this._btnPressed.right  = vals.includes('right');
    // Thrust = both buttons pressed simultaneously
    this._btnPressed.thrust = this._btnPressed.left && this._btnPressed.right;

    this._drawButtons();

    const game = this.scene.get('GameScene');
    if (game?.player) {
      // When thrusting (both pressed), don't rotate
      game.player._btnLeft   = this._btnPressed.left && !this._btnPressed.thrust;
      game.player._btnRight  = this._btnPressed.right && !this._btnPressed.thrust;
      game.player._btnThrust = this._btnPressed.thrust;
    }
  }

  _drawButtons() {
    const g = this._btnGfx;
    g.clear();
    const thrusting = this._btnPressed.thrust;
    const btns = [
      { def: BTN_LEFT,  pressed: this._btnPressed.left },
      { def: BTN_RIGHT, pressed: this._btnPressed.right },
    ];
    for (const { def, pressed } of btns) {
      const lit = thrusting || pressed;
      g.fillStyle(lit ? 0x6688aa : 0x223344, lit ? 0.85 : 0.55);
      g.fillRoundedRect(def.x, BTN_Y, def.w, BTN_H, 8);
      g.lineStyle(1, lit ? 0xaaccff : 0x445566, 0.8);
      g.strokeRoundedRect(def.x, BTN_Y, def.w, BTN_H, 8);
    }
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

    this.altText.setText(`ALT: ${game.altitudeScore}m / ${2500}m`);
    this.scoreText.setText(`SCORE: ${game.getTotalScore()}`);

    if (game.launched && this.launchHint.visible) {
      this.launchHint.setVisible(false);
    }
  }

  _showGameOver(score, hi, reason) {
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
    this.add.text(cx, cy - 80, title, {
      fontSize: '42px', color, fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0);

    this.add.text(cx, cy - 20, `SCORE: ${score}`, {
      fontSize: '26px', color: '#ffdd00', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0);

    this.add.text(cx, cy + 20, `BEST: ${hi}`, {
      fontSize: '20px', color: '#aaaaaa', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0);

    if (score >= hi && score > 0) {
      this.add.text(cx, cy + 52, 'NEW BEST!', {
        fontSize: '18px', color: '#00ff88', fontFamily: 'monospace',
      }).setOrigin(0.5).setScrollFactor(0);
    }

    // Show world seed so players can replay the same map
    const game = this.scene.get('GameScene');
    const seedHex = game?.worldSeedHex || '???';
    this.add.text(cx, cy + 74, `SEED: 0x${seedHex}`, {
      fontSize: '13px', color: '#555555', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0);

    const btn = this.add.text(cx, cy + 115, '[ PLAY AGAIN ]', {
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
    this.input.keyboard.once('keydown-SPACE', restart);
  }
}
