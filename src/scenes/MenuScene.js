export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  preload() {
    this.load.image('crystal', 'assets/crystal.png');
    this.load.image('asteroid_fg', 'assets/asteroid_fg.png');
    this.load.spritesheet('platform_tiles', 'assets/platform_tiles.png', {
      frameWidth: 16, frameHeight: 8,
    });
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;

    // ── Background ──────────────────────────────────────────────
    this.cameras.main.setBackgroundColor('#001020');

    // Subtle starfield
    for (let i = 0; i < 60; i++) {
      const sx = Phaser.Math.Between(0, width);
      const sy = Phaser.Math.Between(0, height);
      const size = Phaser.Math.Between(1, 2);
      const alpha = 0.3 + Math.random() * 0.5;
      this.add.rectangle(sx, sy, size, size, 0xffffff, alpha);
    }

    // ── Title ───────────────────────────────────────────────────
    this.add.text(cx, height * 0.18, 'LUNAR', {
      fontSize: '52px', color: '#ffffff', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(cx, height * 0.25, 'ESCAPE', {
      fontSize: '52px', color: '#00ddff', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    // Subtitle
    this.add.text(cx, height * 0.32, 'Fly. Land. Survive.', {
      fontSize: '16px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // ── Start button ────────────────────────────────────────────
    const startBtn = this.add.text(cx, height * 0.50, '[ START ]', {
      fontSize: '28px', color: '#ffffff', fontFamily: 'monospace',
      backgroundColor: '#224444', padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.tweens.add({ targets: startBtn, alpha: 0.5, duration: 800, yoyo: true, repeat: -1 });

    startBtn.on('pointerover', () => startBtn.setColor('#ffff00'));
    startBtn.on('pointerout', () => startBtn.setColor('#ffffff'));
    startBtn.on('pointerdown', () => this._startGame());

    // ── How to Play button ──────────────────────────────────────
    const helpBtn = this.add.text(cx, height * 0.60, '[ HOW TO PLAY ]', {
      fontSize: '18px', color: '#aaaaaa', fontFamily: 'monospace',
      padding: { x: 10, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    helpBtn.on('pointerover', () => helpBtn.setColor('#ffff00'));
    helpBtn.on('pointerout', () => helpBtn.setColor('#aaaaaa'));
    helpBtn.on('pointerdown', () => this._showInstructions());

    // ── High score ──────────────────────────────────────────────
    const hi = localStorage.getItem('lunarClimberHi') || '0';
    if (parseInt(hi) > 0) {
      this.add.text(cx, height * 0.70, `BEST: ${hi}`, {
        fontSize: '14px', color: '#666666', fontFamily: 'monospace',
      }).setOrigin(0.5);
    }

    // ── Keyboard shortcut ───────────────────────────────────────
    this.input.keyboard.once('keydown-SPACE', () => this._startGame());

    // Track instruction overlay elements for cleanup
    this._instructionElements = [];
  }

  _startGame() {
    this.scene.stop('MenuScene');
    this.scene.start('GameScene');
  }

  _showInstructions() {
    this._clearInstructions();

    const { width, height } = this.scale;
    const cx = width / 2;
    const els = this._instructionElements;

    // Overlay background
    els.push(this.add.rectangle(cx, height / 2, width, height, 0x000000, 0.92));

    // Title
    els.push(this.add.text(cx, height * 0.06, 'HOW TO PLAY', {
      fontSize: '24px', color: '#00ddff', fontFamily: 'monospace',
    }).setOrigin(0.5));

    // ── Instructions with sprites ───────────────────────────────
    const SPRITE_X = 38;
    const TEXT_X = 75;
    let y = height * 0.14;

    // GOAL
    els.push(this.add.text(TEXT_X, y, 'Fly upward through all zones\nto escape the atmosphere.', {
      fontSize: '12px', color: '#cccccc', fontFamily: 'monospace', lineSpacing: 4,
    }));
    const goalGfx = this.add.graphics();
    goalGfx.fillStyle(0x00ddff, 0.8);
    goalGfx.fillTriangle(SPRITE_X, y + 4, SPRITE_X - 8, y + 20, SPRITE_X + 8, y + 20);
    els.push(goalGfx);
    y += 60;

    // FUEL — platform sprite
    const platY = y + 10;
    for (let i = 0; i < 3; i++) {
      const tile = this.add.image(SPRITE_X - 16 + i * 16, platY, 'platform_tiles', 0).setScale(2);
      tile.setTint(0x00ff66);
      els.push(tile);
    }
    els.push(this.add.text(TEXT_X, y, 'Land on platforms to refuel.\n+250 bonus for each landing.\nStay upright and stable!', {
      fontSize: '12px', color: '#cccccc', fontFamily: 'monospace', lineSpacing: 4,
    }));
    y += 70;

    // CRYSTALS — crystal sprite
    els.push(this.add.image(SPRITE_X, y + 12, 'crystal').setScale(2.5));
    els.push(this.add.text(TEXT_X, y, 'Grab crystals for points and\na brief no-fuel-burn boost.\nFuel bar turns blue.', {
      fontSize: '12px', color: '#cccccc', fontFamily: 'monospace', lineSpacing: 4,
    }));
    y += 70;

    // ASTEROIDS — asteroid sprite
    els.push(this.add.image(SPRITE_X, y + 12, 'asteroid_fg').setScale(2));
    els.push(this.add.text(TEXT_X, y, 'Avoid asteroids! They get\nfaster and more frequent\nas you climb higher.', {
      fontSize: '12px', color: '#cccccc', fontFamily: 'monospace', lineSpacing: 4,
    }));
    y += 75;

    // ── Controls section ────────────────────────────────────────
    els.push(this.add.text(cx, y, 'CONTROLS', {
      fontSize: '16px', color: '#00ddff', fontFamily: 'monospace',
    }).setOrigin(0.5));
    y += 32;

    // Keyboard
    els.push(this.add.text(30, y, 'KEYBOARD', {
      fontSize: '12px', color: '#ffdd00', fontFamily: 'monospace',
    }));
    els.push(this.add.text(30, y + 18, 'Left/Right = Rotate\nSpace/Up    = Thrust', {
      fontSize: '12px', color: '#999999', fontFamily: 'monospace', lineSpacing: 4,
    }));
    y += 58;

    // Touch — draw mock buttons
    els.push(this.add.text(30, y, 'TOUCH', {
      fontSize: '12px', color: '#ffdd00', fontFamily: 'monospace',
    }));
    y += 26;

    // Mock mobile control layout
    const mockY = y;
    const mockH = 40;
    const g = this.add.graphics();
    els.push(g);

    // Left side: rotation buttons
    const rotW = 50;
    const rotLX = 30;
    const rotRX = rotLX + rotW + 6;

    g.fillStyle(0x223344, 0.7);
    g.fillRoundedRect(rotLX, mockY, rotW, mockH, 6);
    g.lineStyle(1, 0x445566, 0.8);
    g.strokeRoundedRect(rotLX, mockY, rotW, mockH, 6);

    g.fillStyle(0x223344, 0.7);
    g.fillRoundedRect(rotRX, mockY, rotW, mockH, 6);
    g.lineStyle(1, 0x445566, 0.8);
    g.strokeRoundedRect(rotRX, mockY, rotW, mockH, 6);

    els.push(this.add.text(rotLX + rotW / 2, mockY + mockH / 2, '<<', {
      fontSize: '18px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5));
    els.push(this.add.text(rotRX + rotW / 2, mockY + mockH / 2, '>>', {
      fontSize: '18px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5));

    // Right side: thrust buttons (connected)
    const thrW = 50;
    const thrHalfX = width - 30 - thrW * 2;
    const thrFullX = thrHalfX + thrW;

    g.fillStyle(0x222211, 0.7);
    g.fillRoundedRect(thrHalfX, mockY, thrW, mockH, { tl: 6, tr: 0, bl: 6, br: 0 });
    g.lineStyle(1, 0x444422, 0.8);
    g.strokeRoundedRect(thrHalfX, mockY, thrW, mockH, { tl: 6, tr: 0, bl: 6, br: 0 });

    g.fillStyle(0x332211, 0.7);
    g.fillRoundedRect(thrFullX, mockY, thrW, mockH, { tl: 0, tr: 6, bl: 0, br: 6 });
    g.lineStyle(1, 0x554422, 0.8);
    g.strokeRoundedRect(thrFullX, mockY, thrW, mockH, { tl: 0, tr: 6, bl: 0, br: 6 });

    // Divider
    g.lineStyle(1, 0x666666, 0.5);
    g.beginPath();
    g.moveTo(thrFullX, mockY + 4);
    g.lineTo(thrFullX, mockY + mockH - 4);
    g.strokePath();

    els.push(this.add.text(thrHalfX + thrW / 2, mockY + mockH / 2, 'HALF', {
      fontSize: '10px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5));
    els.push(this.add.text(thrFullX + thrW / 2, mockY + mockH / 2, 'FULL', {
      fontSize: '10px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5));

    // Labels under mock buttons
    els.push(this.add.text(rotLX + rotW + 3, mockY + mockH + 4, 'Rotate', {
      fontSize: '10px', color: '#666666', fontFamily: 'monospace',
    }).setOrigin(0.5, 0));
    els.push(this.add.text(thrHalfX + thrW, mockY + mockH + 4, 'Thrust', {
      fontSize: '10px', color: '#666666', fontFamily: 'monospace',
    }).setOrigin(0.5, 0));

    // Back button
    y = mockY + mockH + 40;
    const backBtn = this.add.text(cx, y, '[ BACK ]', {
      fontSize: '22px', color: '#ffffff', fontFamily: 'monospace',
      backgroundColor: '#333333', padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    els.push(backBtn);

    backBtn.on('pointerover', () => backBtn.setColor('#ffff00'));
    backBtn.on('pointerout', () => backBtn.setColor('#ffffff'));
    backBtn.on('pointerdown', () => this._clearInstructions());

    this.input.keyboard.once('keydown-ESC', () => this._clearInstructions());
  }

  _clearInstructions() {
    for (const el of this._instructionElements) el.destroy();
    this._instructionElements = [];
  }
}
