// Prism Breaker — main: bootstrap, game loop and screen flow. One job: wire
// input, world, sound and rendering together, and run the loop. In shot mode
// (?shot=start|play|level|end) it stages one frozen frame for screenshots.

import { FIELD } from './config.js';
import { SoundEngine } from './audio.js';
import { Input } from './input.js';
import { World, EVENT_LEVEL_CLEAR, EVENT_OVER, EVENT_VICTORY } from './world.js';
import { Renderer, SCREEN_LEVEL_CLEAR, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY } from './render.js';
import { stageShot } from './shots.js';

const BEST_KEY = 'prism-breaker-best';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || '1') || 1;

const world = new World();
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const sound = new SoundEngine();

window.__prism = { errors: [], frames: 0 };
window.addEventListener('error', (event) => {
  window.__prism.errors.push(String(event.message || event.error));
});

let screen = SCREEN_TITLE;
let best = 0;
try {
  best = Number(window.localStorage.getItem(BEST_KEY) || '0') || 0;
} catch {
  best = 0;
}
let lastInput = 'mouse';
let lastMouseMove = -10000;
let displayTime = 0;
let buttons = [];
let lastTime = performance.now();
let muted = false;

function saveBest() {
  if (world.score <= best) return;
  best = world.score;
  try {
    window.localStorage.setItem(BEST_KEY, String(best));
  } catch {
    // Storage may be unavailable (private mode); the best score is a bonus.
  }
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
  const offsetX = (canvas.width - FIELD.width * scale) / 2;
  const offsetY = (canvas.height - FIELD.height * scale) / 2;
  renderer.resize(scale, offsetX, offsetY);
  input.setViewport(scale, offsetX, offsetY);
}
window.addEventListener('resize', resize);
resize();

function startGame() {
  sound.ensure();
  sound.click();
  sound.startMusic();
  world.reset((Date.now() % 2147483647) || 1);
  screen = SCREEN_PLAY;
}

function restart() {
  sound.ensure();
  sound.click();
  world.reset((Date.now() % 2147483647) || 1);
  screen = SCREEN_PLAY;
}

function toggleMute() {
  muted = !muted;
  sound.setMuted(muted);
}

function clickButton(id) {
  if (id === 'start' || id === 'howto') {
    startGame();
    return;
  }
  if (id === 'resume') {
    screen = SCREEN_PLAY;
    return;
  }
  if (id === 'restart') {
    restart();
    return;
  }
  if (id === 'next') {
    sound.click();
    world.advanceLevel();
    screen = SCREEN_PLAY;
  }
}

function handleClicks() {
  const clicks = input.takeClicks();
  if (clicks.length === 0) return;
  sound.ensure();
  clicks.forEach((point) => {
    const hit = buttons.find((button) => (
      point.x >= button.x && point.x <= button.x + button.width
      && point.y >= button.y && point.y <= button.y + button.height
    ));
    if (hit) {
      clickButton(hit.id);
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (world.balls.some((ball) => ball.stuck)) world.launchBall();
      else if (world.effects.laser > 0) world.fireLaser();
    }
  });
}

function handleKeys() {
  if (input.pressed('KeyM')) toggleMute();
  if (screen === SCREEN_TITLE) {
    if (input.pressed('Space') || input.pressed('Enter')) startGame();
    return;
  }
  if (screen === SCREEN_PLAY) {
    if (input.pressed('KeyP') || input.pressed('Escape')) {
      screen = SCREEN_PAUSED;
      return;
    }
    if (input.pressed('KeyR')) {
      restart();
      return;
    }
    if (input.pressed('Space')) {
      sound.ensure();
      if (world.balls.some((ball) => ball.stuck)) world.launchBall();
      else if (world.effects.laser > 0) world.fireLaser();
    }
    return;
  }
  if (screen === SCREEN_PAUSED) {
    if (input.pressed('KeyP') || input.pressed('Escape') || input.pressed('Space')) screen = SCREEN_PLAY;
    if (input.pressed('KeyR')) restart();
    return;
  }
  if (screen === SCREEN_LEVEL_CLEAR) {
    if (input.pressed('Space') || input.pressed('Enter')) {
      sound.click();
      world.advanceLevel();
      screen = SCREEN_PLAY;
    }
    return;
  }
  if (screen === SCREEN_OVER || screen === SCREEN_VICTORY) {
    if (input.pressed('KeyR') || input.pressed('Space') || input.pressed('Enter')) restart();
  }
}

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;
  displayTime += dt;
  window.__prism.frames += 1;
  if (input.isDown('ArrowLeft') || input.isDown('ArrowRight') || input.isDown('KeyA') || input.isDown('KeyD')) {
    lastInput = 'keys';
  }
  handleKeys();
  handleClicks();
  if (screen === SCREEN_PLAY) {
    const useMouse = lastInput === 'mouse' && input.mouseInside && now - lastMouseMove < 4000;
    const events = world.step(dt, input.moveDirection(), useMouse, input.mouseX, { launch: false, fire: false });
    if (events & EVENT_OVER) {
      sound.stopMusic();
      sound.gameOver();
      saveBest();
      screen = SCREEN_OVER;
    } else if (events & EVENT_VICTORY) {
      sound.stopMusic();
      sound.fanfare();
      saveBest();
      screen = SCREEN_VICTORY;
    } else if (events & EVENT_LEVEL_CLEAR) {
      sound.fanfare();
      screen = SCREEN_LEVEL_CLEAR;
    }
  }
  buttons = renderer.draw(world, screen, displayTime, best);
  if (window.__prism.frames % 60 === 0) {
    statusEl.textContent = `frames=${window.__prism.frames} screen=${screen} score=${world.score} errors=${window.__prism.errors.length}`;
  }
  window.requestAnimationFrame(frame);
}

canvas.addEventListener('mousemove', () => {
  lastInput = 'mouse';
  lastMouseMove = performance.now();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
});

if (shotName) {
  const staged = stageShot(shotName, world);
  screen = staged.screen;
  best = staged.best;
  buttons = renderer.draw(world, screen, displayTime, best);
  statusEl.textContent = `shot=${shotName} screen=${screen} score=${world.score} errors=${window.__prism.errors.length}`;
  document.title = `Prism Breaker — shot ${shotName}`;
} else {
  window.requestAnimationFrame(frame);
}
