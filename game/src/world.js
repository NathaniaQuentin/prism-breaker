// Prism Breaker — world: the game's state and rules. One job: step the
// simulation forward (paddle, balls, bricks, power-ups, particles, score)
// and report what happened, with no drawing and no sound.

import {
  BALL, BRICK, BRICK_TYPES, FIELD, LEVELS, LEVEL_CLEAR_BONUS_PER_LEVEL,
  LEVEL_CLEAR_BONUS_PER_LIFE, MAX_COMBO_MULTIPLIER, PADDLE, POWERUPS,
  POWERUP_DROP_CHANCE, POWERUP_KEYS, ROW_COLORS, START_LIVES, clamp, lerp,
  mulberry32,
} from './config.js';

export const EVENT_NONE = 0;
export const EVENT_LIFE_LOST = 1;
export const EVENT_LEVEL_CLEAR = 2;
export const EVENT_OVER = 4;
export const EVENT_VICTORY = 8;

function brickRect(brick) {
  return {
    x: BRICK.left + brick.col * (BRICK.width + BRICK.gap),
    y: BRICK.top + brick.row * (BRICK.height + BRICK.gap),
    width: BRICK.width,
    height: BRICK.height,
  };
}

export class World {
  constructor() {
    this.random = mulberry32(1);
    this.reset(1);
  }

  reset(seed) {
    this.random = mulberry32(seed);
    this.time = 0;
    this.levelIndex = 0;
    this.score = 0;
    this.lives = START_LIVES;
    this.combo = 0;
    this.bestCombo = 0;
    this.shake = 0;
    this.levelClearBonus = 0;
    this.bricks = [];
    this.balls = [];
    this.powerups = [];
    this.bolts = [];
    this.particles = [];
    this.texts = [];
    this.effects = { wide: 0, laser: 0, slow: 0, sticky: 0, fire: 0 };
    this.laserCooldown = 0;
    this.paddle = { x: FIELD.width / 2 - PADDLE.width / 2, width: PADDLE.width };
    this.loadLevel(0);
    this.serveBall();
  }

  loadLevel(index) {
    this.levelIndex = index;
    this.bricks = [];
    this.powerups = [];
    this.bolts = [];
    const level = LEVELS[index];
    level.rows.forEach((row, rowIndex) => {
      for (let col = 0; col < Math.min(row.length, BRICK.cols); col += 1) {
        const type = row[col];
        if (type === '.' || !BRICK_TYPES[type]) continue;
        this.bricks.push({
          col, row: rowIndex, type,
          hp: BRICK_TYPES[type].hp,
          maxHp: BRICK_TYPES[type].hp,
          color: ROW_COLORS[rowIndex % ROW_COLORS.length],
          baseX: BRICK.left + col * (BRICK.width + BRICK.gap),
          phase: this.random() * Math.PI * 2,
        });
      }
    });
  }

  breakableLeft() {
    return this.bricks.filter((brick) => brick.type !== 'u').length;
  }

  ballSpeed() {
    const base = Math.min(
      BALL.baseSpeed + this.levelIndex * BALL.speedPerLevel,
      BALL.maxSpeed,
    );
    return this.effects.slow > 0 ? base * 0.7 : base;
  }

  serveBall() {
    this.balls.push({
      x: this.paddle.x + this.paddle.width / 2,
      y: PADDLE.y - BALL.radius - 1,
      vx: 0, vy: 0,
      stuck: true,
    });
  }

  launchBall() {
    const stuck = this.balls.find((ball) => ball.stuck);
    if (!stuck) return false;
    const angle = (this.random() - 0.5) * 0.9;
    const speed = this.ballSpeed();
    stuck.vx = Math.sin(angle) * speed;
    stuck.vy = -Math.cos(angle) * speed;
    stuck.stuck = false;
    return true;
  }

  multiplier() {
    return Math.min(1 + Math.floor(this.combo / 4), MAX_COMBO_MULTIPLIER);
  }

  addScore(points, x, y) {
    this.score += points;
    this.texts.push({ x, y, text: `+${points}`, life: 0.9, maxLife: 0.9, color: '#ffffff' });
  }

  burst(x, y, color, count, speed = 260) {
    for (let i = 0; i < count; i += 1) {
      const angle = this.random() * Math.PI * 2;
      const velocity = speed * (0.3 + this.random() * 0.7);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 60,
        life: 0.5 + this.random() * 0.5,
        maxLife: 1,
        color,
        size: 2 + this.random() * 4,
        shard: this.random() < 0.5,
      });
    }
  }

  explodeBrick(brick, rect) {
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    this.burst(centerX, centerY, brick.color, 14, 300);
    this.burst(centerX, centerY, '#ffffff', 6, 180);
    this.shake = Math.max(this.shake, 7);
  }

  damageBrick(brick, damage, ball) {
    if (brick.type === 'u') return false;
    brick.hp -= damage;
    const rect = brickRect(brick);
    if (brick.hp > 0) {
      this.burst(rect.x + rect.width / 2, rect.y + rect.height / 2, brick.color, 4, 140);
      return false;
    }
    this.removeBrick(brick, rect, ball);
    return true;
  }

  removeBrick(brick, rect, ball) {
    this.bricks.splice(this.bricks.indexOf(brick), 1);
    const gained = BRICK_TYPES[brick.type].score * this.multiplier();
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.addScore(gained, rect.x + rect.width / 2, rect.y);
    this.explodeBrick(brick, rect);
    if (brick.type === 'x') this.detonate(rect, ball);
    if (brick.type === 'b' || this.random() < POWERUP_DROP_CHANCE) {
      this.dropPowerup(rect.x + rect.width / 2, rect.y + rect.height / 2, brick.type === 'b');
    }
  }

  detonate(rect, ball) {
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const neighbours = this.bricks.filter((other) => {
      if (other.type === 'u') return false;
      const otherRect = brickRect(other);
      const dx = otherRect.x + otherRect.width / 2 - centerX;
      const dy = otherRect.y + otherRect.height / 2 - centerY;
      return Math.abs(dx) < BRICK.width * 1.6 && Math.abs(dy) < BRICK.height * 2.2;
    });
    neighbours.forEach((other) => {
      const otherRect = brickRect(other);
      this.bricks.splice(this.bricks.indexOf(other), 1);
      const gained = BRICK_TYPES[other.type].score * this.multiplier();
      this.addScore(gained, otherRect.x + otherRect.width / 2, otherRect.y);
      this.burst(otherRect.x + otherRect.width / 2, otherRect.y + otherRect.height / 2, other.color, 8, 220);
    });
    if (ball) {
      const dx = ball.x - centerX;
      const dy = ball.y - centerY;
      const distance = Math.max(1, Math.hypot(dx, dy));
      ball.vx += (dx / distance) * 120;
      ball.vy += (dy / distance) * 120;
    }
  }

  dropPowerup(x, y, guaranteed) {
    const key = guaranteed
      ? POWERUP_KEYS[Math.floor(this.random() * POWERUP_KEYS.length)]
      : POWERUP_KEYS[Math.floor(this.random() * POWERUP_KEYS.length)];
    this.powerups.push({ x, y, key, vy: 150, sway: this.random() * Math.PI * 2 });
  }

  applyPowerup(key) {
    const def = POWERUPS[key];
    if (!def) return;
    if (key === 'M') {
      const source = this.balls.find((ball) => !ball.stuck) || this.balls[0];
      if (!source) return;
      for (let i = 0; i < 2; i += 1) {
        const angle = (this.random() - 0.5) * 1.4;
        const speed = this.ballSpeed();
        this.balls.push({
          x: source.x, y: source.y,
          vx: Math.sin(angle) * speed,
          vy: -Math.abs(Math.cos(angle)) * speed,
          stuck: false,
        });
      }
      return;
    }
    if (key === 'E') {
      this.lives += 1;
      return;
    }
    const field = { W: 'wide', L: 'laser', S: 'slow', T: 'sticky', F: 'fire' }[key];
    if (field) this.effects[field] = def.seconds;
  }

  fireLaser() {
    if (this.effects.laser <= 0 || this.laserCooldown > 0) return;
    this.laserCooldown = 0.35;
    const cx = this.paddle.x + this.paddle.width / 2;
    this.bolts.push({ x: cx - 26, y: PADDLE.y - 10, vy: -760 });
    this.bolts.push({ x: cx + 26, y: PADDLE.y - 10, vy: -760 });
  }

  step(dt, move, useMouse, mouseX, actions) {
    this.time += dt;
    let events = EVENT_NONE;
    Object.keys(this.effects).forEach((key) => {
      this.effects[key] = Math.max(0, this.effects[key] - dt);
    });
    this.laserCooldown = Math.max(0, this.laserCooldown - dt);
    this.shake = Math.max(0, this.shake - dt * 26);

    const targetWidth = this.effects.wide > 0 ? PADDLE.wideWidth : PADDLE.width;
    this.paddle.width = lerp(this.paddle.width, targetWidth, Math.min(1, dt * 10));
    if (useMouse) {
      this.paddle.x = lerp(this.paddle.x, mouseX - this.paddle.width / 2, Math.min(1, dt * 22));
    } else if (move !== 0) {
      this.paddle.x += move * PADDLE.speed * dt;
    }
    this.paddle.x = clamp(this.paddle.x, 0, FIELD.width - this.paddle.width);

    if (actions.launch) this.launchBall();
    if (actions.fire) this.fireLaser();

    this.bricks.forEach((brick) => {
      if (brick.type !== 'm') return;
      const rect = brickRect(brick);
      const offset = Math.sin(this.time * 1.4 + brick.phase) * 42;
      brick.slide = clamp(offset, -(rect.x - 8), FIELD.width - 8 - (rect.x + rect.width));
    });

    const speed = this.ballSpeed();
    this.balls = this.balls.filter((ball) => {
      if (ball.stuck) {
        ball.x = this.paddle.x + this.paddle.width / 2;
        ball.y = PADDLE.y - BALL.radius - 1;
        return true;
      }
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.x < BALL.radius) { ball.x = BALL.radius; ball.vx = Math.abs(ball.vx); }
      if (ball.x > FIELD.width - BALL.radius) { ball.x = FIELD.width - BALL.radius; ball.vx = -Math.abs(ball.vx); }
      if (ball.y < BALL.radius + 64) { ball.y = BALL.radius + 64; ball.vy = Math.abs(ball.vy); }
      if (this.hitPaddle(ball)) {
        if (this.effects.sticky > 0) {
          ball.stuck = true;
          ball.vx = 0;
          ball.vy = 0;
        }
      }
      this.hitBricks(ball, speed);
      return ball.y < FIELD.height + 40;
    });

    if (this.balls.length === 0) {
      this.lives -= 1;
      this.combo = 0;
      if (this.lives <= 0) return EVENT_OVER;
      this.serveBall();
      return EVENT_LIFE_LOST;
    }

    this.bolts = this.bolts.filter((bolt) => {
      bolt.y += bolt.vy * dt;
      for (let i = 0; i < this.bricks.length; i += 1) {
        const brick = this.bricks[i];
        const rect = this.brickDrawRect(brick);
        if (bolt.x > rect.x && bolt.x < rect.x + rect.width && bolt.y > rect.y && bolt.y < rect.y + rect.height) {
          this.burst(bolt.x, bolt.y, '#ffd32a', 6, 160);
          this.damageBrick(brick, 1, null);
          return false;
        }
      }
      return bolt.y > 56;
    });

    this.powerups = this.powerups.filter((drop) => {
      drop.sway += dt * 3;
      drop.y += drop.vy * dt;
      drop.x += Math.sin(drop.sway) * 24 * dt;
      const caught = drop.y + 12 > PADDLE.y && drop.y - 12 < PADDLE.y + PADDLE.height
        && drop.x > this.paddle.x - 10 && drop.x < this.paddle.x + this.paddle.width + 10;
      if (caught) {
        this.applyPowerup(drop.key);
        this.burst(drop.x, drop.y, POWERUPS[drop.key].color, 10, 160);
        return false;
      }
      return drop.y < FIELD.height + 20;
    });

    this.particles = this.particles.filter((particle) => {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 320 * dt;
      return particle.life > 0;
    });
    this.texts = this.texts.filter((text) => {
      text.life -= dt;
      text.y -= 34 * dt;
      return text.life > 0;
    });

    if (this.breakableLeft() === 0) {
      this.levelClearBonus = LEVEL_CLEAR_BONUS_PER_LEVEL * (this.levelIndex + 1)
        + LEVEL_CLEAR_BONUS_PER_LIFE * this.lives;
      this.score += this.levelClearBonus;
      if (this.levelIndex >= LEVELS.length - 1) return EVENT_VICTORY;
      return EVENT_LEVEL_CLEAR;
    }
    return events;
  }

  brickDrawRect(brick) {
    const rect = brickRect(brick);
    if (brick.type === 'm' && typeof brick.slide === 'number') rect.x += brick.slide;
    return rect;
  }

  hitPaddle(ball) {
    if (ball.vy <= 0) return false;
    const paddleTop = PADDLE.y;
    if (ball.y + BALL.radius < paddleTop || ball.y - BALL.radius > paddleTop + PADDLE.height) return false;
    if (ball.x < this.paddle.x - BALL.radius || ball.x > this.paddle.x + this.paddle.width + BALL.radius) return false;
    const offset = clamp((ball.x - (this.paddle.x + this.paddle.width / 2)) / (this.paddle.width / 2), -1, 1);
    const angle = offset * 1.05;
    const speed = this.ballSpeed();
    ball.vx = Math.sin(angle) * speed;
    ball.vy = -Math.cos(angle) * speed;
    ball.y = paddleTop - BALL.radius - 0.5;
    return true;
  }

  hitBricks(ball, speed) {
    for (let i = 0; i < this.bricks.length; i += 1) {
      const brick = this.bricks[i];
      const rect = this.brickDrawRect(brick);
      const nearestX = clamp(ball.x, rect.x, rect.x + rect.width);
      const nearestY = clamp(ball.y, rect.y, rect.y + rect.height);
      const dx = ball.x - nearestX;
      const dy = ball.y - nearestY;
      if (dx * dx + dy * dy > BALL.radius * BALL.radius) continue;
      const wasDestroyed = this.damageBrick(brick, 1, ball);
      if (this.effects.fire > 0 && brick.type !== 'u') continue;
      if (Math.abs(dx) > Math.abs(dy)) {
        ball.vx = dx > 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx);
        ball.x += dx > 0 ? 2 : -2;
      } else {
        ball.vy = dy > 0 ? Math.abs(ball.vy) : -Math.abs(ball.vy);
        ball.y += dy > 0 ? 2 : -2;
      }
      const current = Math.hypot(ball.vx, ball.vy) || 1;
      ball.vx = (ball.vx / current) * speed;
      ball.vy = (ball.vy / current) * speed;
      if (wasDestroyed) this.burst(ball.x, ball.y, brick.color, 4, 120);
      return;
    }
  }

  advanceLevel() {
    this.balls = [];
    this.powerups = [];
    this.bolts = [];
    this.effects = { wide: 0, laser: 0, slow: 0, sticky: 0, fire: 0 };
    this.combo = 0;
    this.levelClearBonus = 0;
    this.loadLevel(this.levelIndex + 1);
    this.serveBall();
  }

  /** Staging helpers used only by shots.js to frame a level-clear screen. */
  forceLevelClear() {
    this.bricks = this.bricks.filter((brick) => brick.type === 'u');
    this.levelClearBonus = LEVEL_CLEAR_BONUS_PER_LEVEL * (this.levelIndex + 1)
      + LEVEL_CLEAR_BONUS_PER_LIFE * this.lives;
    this.score += this.levelClearBonus;
  }

  /** Staging helper used only by shots.js to frame a game-over screen. */
  forceGameOver() {
    this.lives = 0;
    this.balls = [];
  }
}
