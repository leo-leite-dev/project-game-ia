export default class InputController {
  constructor() {
    this.keys = new Set();

    this.handleKeyDown = (event) => {
      if (event.code.startsWith('Arrow')) event.preventDefault();
      this.keys.add(event.code);
    };

    this.handleKeyUp = (event) => {
      this.keys.delete(event.code);
    };

    this.handleBlur = () => {
      this.keys.clear();
    };

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  isDown(...codes) {
    return codes.some((code) => this.keys.has(code));
  }

  getMovement() {
    return {
      x:
        Number(this.isDown('KeyD', 'ArrowRight')) -
        Number(this.isDown('KeyA', 'ArrowLeft')),
      z:
        Number(this.isDown('KeyW', 'ArrowUp')) -
        Number(this.isDown('KeyS', 'ArrowDown')),
    };
  }
}
