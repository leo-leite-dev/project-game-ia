import Phaser from 'phaser';

const PLAYER_SIZE = 40;
const PLAYER_SPEED = 260;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    const { width, height } = this.scale;

    this.physics.world.setBounds(0, 0, width, height);

    this.add
      .text(24, 20, 'WASD ou setas para mover', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#c7d2fe',
      })
      .setOrigin(0, 0);

    this.player = this.add
      .rectangle(width / 2, height / 2, PLAYER_SIZE, PLAYER_SIZE, 0x3b82f6)
      .setStrokeStyle(3, 0x93c5fd);

    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.player.body.setSize(PLAYER_SIZE, PLAYER_SIZE);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    this.input.keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.W,
      Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.S,
      Phaser.Input.Keyboard.KeyCodes.D,
    ]);
  }

  update() {
    const body = this.player.body;

    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;

    const direction = new Phaser.Math.Vector2(
      Number(right) - Number(left),
      Number(down) - Number(up)
    );

    if (direction.lengthSq() > 0) {
      direction.normalize().scale(PLAYER_SPEED);
      body.setVelocity(direction.x, direction.y);
    } else {
      body.setVelocity(0, 0);
    }
  }
}
