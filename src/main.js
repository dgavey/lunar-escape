import Phaser from 'phaser';
import GameScene from './scenes/GameScene.js';
import UIScene from './scenes/UIScene.js';

const config = {
  type: Phaser.AUTO,
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  backgroundColor: '#001020',
  parent: 'game-container',
  scale: {
    mode: Phaser.Scale.ENVELOP,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 390,
    height: 844,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { y: 0.15 },
      debug: false,
    },
  },
  scene: [GameScene, UIScene],
};

new Phaser.Game(config);
