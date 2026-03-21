export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  preload() {
    const { width, height } = this.scale;
    const cx = width / 2;

    this.cameras.main.setBackgroundColor('#001020');

    // ── Procedural dot stars (visible while assets load) ──────
    this._preloadStars = [];
    for (let i = 0; i < 50; i++) {
      const dot = this.add.rectangle(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        Phaser.Math.Between(1, 2),
        Phaser.Math.Between(1, 2),
        0xffffff, 0.3 + Math.random() * 0.5
      );
      this._preloadStars.push(dot);
    }

    // ── Title (shown during load) ─────────────────────────────
    this.add.text(cx, height * 0.18, 'LUNAR', {
      fontSize: '52px', color: '#ffffff', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(cx, height * 0.25, 'ESCAPE', {
      fontSize: '52px', color: '#00ddff', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(cx, height * 0.32, 'Fly. Land. Survive.', {
      fontSize: '16px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // ── Loading bar ───────────────────────────────────────────
    const barW = 200;
    const barH = 8;
    const barX = cx - barW / 2;
    const barY = height * 0.50;

    const border = this.add.graphics();
    border.lineStyle(1, 0x445566, 0.8);
    border.strokeRect(barX - 1, barY - 1, barW + 2, barH + 2);

    const fill = this.add.graphics();

    this._loadText = this.add.text(cx, barY - 20, 'LOADING...', {
      fontSize: '14px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this._loadBarElements = [border, fill];

    this.load.on('progress', (pct) => {
      fill.clear();
      fill.fillStyle(0x00ddff, 0.8);
      fill.fillRect(barX, barY, barW * pct, barH);
    });

    // ── Load all game assets ──────────────────────────────────
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
    this.load.image('shield_pickup', 'assets/shield_pickup.png');
    this.load.image('asteroid_bg', 'assets/asteroid_bg.png');
    this.load.image('asteroid_fg', 'assets/asteroid_fg.png');
    this.load.image('surface_layer1', 'assets/surface_layer1.png');
    this.load.image('surface_layer2', 'assets/surface_layer2.png');
    this.load.image('surface_layer3', 'assets/surface_layer3.png');
    this.load.image('surface_layer4', 'assets/surface_layer4.png');
    this.load.spritesheet('explosion', 'assets/explosion.png', {
      frameWidth: 32, frameHeight: 32,
    });

    // Sound effects
    this.load.audio('sfx_pickup', 'assets/sounds/pickup.mp3');
    this.load.audio('sfx_explosion', 'assets/sounds/explosion.mp3');
    this.load.audio('sfx_thrust', ['assets/sounds/thrust.ogg', 'assets/sounds/thrust.mp3']);
    this.load.audio('sfx_refuel', 'assets/sounds/refuel.mp3');
    this.load.audio('sfx_crystal_boost', 'assets/sounds/crystal_boost.mp3');
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;

    // ── Replace dot stars with star_tiles ──────────────────────
    for (const dot of this._preloadStars) dot.destroy();
    this._preloadStars = null;

    for (let i = 0; i < 50; i++) {
      const frame = Phaser.Math.Between(0, 6);
      const scale = Phaser.Math.FloatBetween(1.5, 3);
      this.add.image(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        'star_tiles', frame
      ).setScale(scale).setOrigin(0.5).setAlpha(Phaser.Math.FloatBetween(0.4, 1))
        .setDepth(-1);
    }

    // ── Remove loading bar, show buttons ──────────────────────
    for (const el of this._loadBarElements) el.destroy();
    this._loadBarElements = null;
    this._loadText.destroy();

    // ── Start button ──────────────────────────────────────────
    const startBtn = this.add.text(cx, height * 0.50, '[ START ]', {
      fontSize: '28px', color: '#ffffff', fontFamily: 'monospace',
      backgroundColor: '#224444', padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.tweens.add({ targets: startBtn, alpha: 0.5, duration: 800, yoyo: true, repeat: -1 });

    startBtn.on('pointerover', () => startBtn.setColor('#ffff00'));
    startBtn.on('pointerout', () => startBtn.setColor('#ffffff'));
    startBtn.on('pointerdown', () => this._startGame());

    // ── How to Play button ────────────────────────────────────
    const helpBtn = this.add.text(cx, height * 0.60, '[ HOW TO PLAY ]', {
      fontSize: '18px', color: '#aaaaaa', fontFamily: 'monospace',
      padding: { x: 10, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    helpBtn.on('pointerover', () => helpBtn.setColor('#ffff00'));
    helpBtn.on('pointerout', () => helpBtn.setColor('#aaaaaa'));
    helpBtn.on('pointerdown', () => this._showInstructions());

    // ── High score ────────────────────────────────────────────
    const hi = localStorage.getItem('lunarClimberHi') || '0';
    if (parseInt(hi) > 0) {
      this.add.text(cx, height * 0.70, `BEST: ${hi}`, {
        fontSize: '14px', color: '#666666', fontFamily: 'monospace',
      }).setOrigin(0.5);
    }

    // ── Keyboard shortcut ─────────────────────────────────────
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
    els.push(this.add.rectangle(cx, height / 2, width, height, 0x001020, 0.95));

    // Stars behind help content
    for (let i = 0; i < 40; i++) {
      const frame = Phaser.Math.Between(0, 6);
      const scale = Phaser.Math.FloatBetween(1.5, 3);
      els.push(this.add.image(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        'star_tiles', frame
      ).setScale(scale).setOrigin(0.5).setAlpha(Phaser.Math.FloatBetween(0.3, 0.7)));
    }

    // Title
    els.push(this.add.text(cx, height * 0.06, 'HOW TO PLAY', {
      fontSize: '24px', color: '#00ddff', fontFamily: 'monospace',
    }).setOrigin(0.5));

    // ── Instructions with sprites ─────────────────────────────
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
    y += 70;

    // SHIELD — shield sprite
    els.push(this.add.image(SPRITE_X, y + 10, 'shield_pickup').setScale(2.5));
    els.push(this.add.text(TEXT_X, y, 'Shields absorb one hit.\nCollect multiples to\nstack protection.', {
      fontSize: '12px', color: '#cccccc', fontFamily: 'monospace', lineSpacing: 4,
    }));
    y += 70;

    // ── Controls section ──────────────────────────────────────
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
