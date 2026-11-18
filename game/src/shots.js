// Prism Breaker — shots: the staged scenes behind ?shot=start|play|level|end.
// Each one plays the real rules forward from a fresh world for a fixed time,
// steered by a simple autopilot (track the lowest falling ball, keep the
// paddle under it), so the frame is what a real game looks like and the same
// seed always gives the same frame.

import { FIELD, STEP } from './config.js';
import { EVENT_LEVEL_CLEAR, EVENT_OVER, EVENT_VICTORY } from './world.js';
import {
  SCREEN_LEVEL_CLEAR, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE,
} from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 20;
const LEVEL_LIMIT_SECONDS = 150;
const END_LIMIT_SECONDS = 150;
const SAMPLE = STEP;

/** Where the paddle should be: under the lowest ball that is falling. */
function autopilotTarget(world) {
  let target = null;
  world.balls.forEach((ball) => {
    if (ball.stuck) return;
    if (target === null || ball.y > target.y) target = ball;
  });
  if (!target) return FIELD.width / 2;
  return target.x;
}

function autopilotMove(world) {
  const centre = world.paddle.x + world.paddle.width / 2;
  const target = autopilotTarget(world);
  if (target > centre + 6) return 1;
  if (target < centre - 6) return -1;
  return 0;
}

/** Play forward for `seconds`, launching and firing when able. Returns events. */
function playForward(world, seconds, weak) {
  let events = 0;
  const steps = Math.floor(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    const move = weak && i % 2 === 0 ? 0 : autopilotMove(world);
    const actions = { launch: true, fire: true };
    events = world.step(SAMPLE, move, false, FIELD.width / 2, actions);
    if (events & (EVENT_OVER | EVENT_LEVEL_CLEAR | EVENT_VICTORY)) return events;
  }
  return events;
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * start: title over a fresh field. play: mid-game with a real score.
 * level: the level-clear screen. end: the game-over screen.
 */
export function stageShot(name, world) {
  world.reset(1);
  if (name !== 'play' && name !== 'level' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / SAMPLE; i += 1) {
      world.step(SAMPLE, 0, false, FIELD.width / 2, { launch: false, fire: false });
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    playForward(world, PLAY_SECONDS, false);
    return { screen: SCREEN_PLAY, best: world.score };
  }
  if (name === 'level') {
    const events = playForward(world, LEVEL_LIMIT_SECONDS, false);
    if (!(events & (EVENT_LEVEL_CLEAR | EVENT_VICTORY))) world.forceLevelClear();
    return { screen: SCREEN_LEVEL_CLEAR, best: world.score };
  }
  const events = playForward(world, END_LIMIT_SECONDS, true);
  if (!(events & EVENT_OVER)) world.forceGameOver();
  return { screen: SCREEN_OVER, best: world.score };
}
