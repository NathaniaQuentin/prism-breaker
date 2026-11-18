// Prism Breaker — input: keyboard and mouse state, translated into the game's
// virtual coordinates. One job: tell the game what the player is doing.

import { FIELD, clamp } from './config.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseX = FIELD.width / 2;
    this.mouseY = FIELD.height / 2;
    this.mouseInside = false;
    this.clicks = [];
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this._attach();
  }

  _attach() {
    window.addEventListener('keydown', (event) => {
      if (['ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
    this.canvas.addEventListener('mousemove', (event) => {
      this.mouseInside = true;
      const point = this._toVirtual(event.clientX, event.clientY);
      this.mouseX = point.x;
      this.mouseY = point.y;
    });
    this.canvas.addEventListener('mouseleave', () => {
      this.mouseInside = false;
    });
    this.canvas.addEventListener('mousedown', (event) => {
      const point = this._toVirtual(event.clientX, event.clientY);
      this.clicks.push(point);
    });
  }

  /** The canvas letterboxes the field; keep the scale and offsets for mapping. */
  setViewport(scale, offsetX, offsetY) {
    this.scale = scale;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
  }

  _toVirtual(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clamp((clientX - rect.left - this.offsetX) / this.scale, 0, FIELD.width),
      y: clamp((clientY - rect.top - this.offsetY) / this.scale, 0, FIELD.height),
    };
  }

  isDown(code) {
    return this.keys.has(code);
  }

  /** True once when the key was pressed since the last frame's check. */
  pressed(code) {
    if (!this.keys.has(code)) return false;
    this.keys.delete(code);
    return true;
  }

  /** -1, 0 or 1 from the left/right keys. */
  moveDirection() {
    const left = this.isDown('ArrowLeft') || this.isDown('KeyA');
    const right = this.isDown('ArrowRight') || this.isDown('KeyD');
    if (left && !right) return -1;
    if (right && !left) return 1;
    return 0;
  }

  /** Take and clear the clicks queued since the last frame. */
  takeClicks() {
    const queued = this.clicks;
    this.clicks = [];
    return queued;
  }
}
