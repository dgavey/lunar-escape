export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;

    this.add.text(cx, height / 2 - 80, 'LUNAR CLIMBER', {
      fontSize: '44px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, height / 2 - 10, 'Fly upward. Collect fuel.\nGet as high as you can.', {
      fontSize: '17px', color: '#aaaaaa', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5);

    // Controls hint
    this.add.text(cx, height / 2 + 50,
      'MOBILE: tap left/right to rotate\nhold both to thrust\n\nDESKTOP: arrows to rotate, SPACE to thrust', {
      fontSize: '13px', color: '#666666', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5);

    const hi = localStorage.getItem('lunarClimberHi') || '0';
    this.add.text(cx, height / 2 + 130, `BEST: ${hi}`, {
      fontSize: '16px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5);

    const startText = this.add.text(cx, height / 2 + 170, 'TAP or SPACE to Start', {
      fontSize: '22px', color: '#ffff00', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: startText, alpha: 0, duration: 600, yoyo: true, repeat: -1,
    });

    this.input.once('pointerdown', () => this._start());
    this.input.keyboard.once('keydown-SPACE', () => this._start());
  }

  _start() {
    this.scene.stop('MenuScene');
    this.scene.start('GameScene');
    this.scene.start('UIScene');
  }
}
