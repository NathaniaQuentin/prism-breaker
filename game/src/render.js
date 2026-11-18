// Prism Breaker — render: everything the player sees, drawn on one canvas.
// One job: turn the world's state into a picture (field, HUD, menus), with
// no rules and no input of its own.

import {
  BALL, BRICK, COLORS, FIELD, LEVELS, PADDLE, POWERUPS, ROW_COLORS,
  clamp, mulberry32,
} from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LEVEL_CLEAR = 'level-clear';
export const SCREEN_OVER = 'over';
export const SCREEN_VICTORY = 'victory';

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    const random = mulberry32(42);
    this.stars = [];
    for (let i = 0; i < 110; i += 1) {
      this.stars.push({
        x: random() * FIELD.width,
        y: random() * FIELD.height,
        radius: 0.6 + random() * 1.8,
        phase: random() * Math.PI * 2,
        speed: 0.4 + random() * 1.2,
      });
    }
  }

  resize(scale, offsetX, offsetY) {
    this.scale = scale;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
  }

  draw(world, screen, time, best) {
    const ctx = this.ctx;
    const shakeX = world.shake > 0 ? (Math.random() - 0.5) * world.shake : 0;
    const shakeY = world.shake > 0 ? (Math.random() - 0.5) * world.shake : 0;
    ctx.save();
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX + shakeX * this.scale, this.offsetY + shakeY * this.scale);
    this.drawBackground(ctx, time);
    if (screen === SCREEN_TITLE) this.drawTitleField(ctx, world, time);
    else this.drawField(ctx, world, time);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) this.drawHud(ctx, world, best);
    let buttons = [];
    if (screen === SCREEN_TITLE) buttons = this.drawTitle(ctx, world, best, time);
    else if (screen === SCREEN_PAUSED) buttons = this.drawPaused(ctx);
    else if (screen === SCREEN_LEVEL_CLEAR) buttons = this.drawLevelClear(ctx, world);
    else if (screen === SCREEN_OVER) buttons = this.drawGameOver(ctx, world, best);
    else if (screen === SCREEN_VICTORY) buttons = this.drawVictory(ctx, world, best);
    ctx.restore();
    return buttons;
  }

  drawBackground(ctx, time) {
    const gradient = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, COLORS.backgroundEdge);
    gradient.addColorStop(0.5, COLORS.background);
    gradient.addColorStop(1, '#0a0618');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= FIELD.width; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, FIELD.height);
      ctx.stroke();
    }
    for (let y = 0; y <= FIELD.height; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(FIELD.width, y);
      ctx.stroke();
    }
    this.stars.forEach((star) => {
      const alpha = 0.25 + 0.55 * Math.abs(Math.sin(time * star.speed + star.phase));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#cdd7ff';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  drawTitleField(ctx, world, time) {
    this.drawBricks(ctx, world);
    this.drawPaddle(ctx, world, time);
    this.drawBalls(ctx, world);
  }

  drawField(ctx, world, time) {
    this.drawBricks(ctx, world);
    this.drawPowerups(ctx, world, time);
    this.drawBolts(ctx, world);
    this.drawPaddle(ctx, world, time);
    this.drawBalls(ctx, world);
    this.drawParticles(ctx, world);
    this.drawTexts(ctx, world);
  }

  drawBricks(ctx, world) {
    world.bricks.forEach((brick) => {
      const rect = world.brickDrawRect(brick);
      const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
      gradient.addColorStop(0, brick.color);
      gradient.addColorStop(1, '#1a1030');
      ctx.save();
      ctx.shadowColor = brick.color;
      ctx.shadowBlur = brick.type === 'x' ? 18 : 10;
      ctx.fillStyle = gradient;
      roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 5);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      roundRect(ctx, rect.x + 2, rect.y + 2, rect.width - 4, 6, 3);
      ctx.fill();
      if (brick.type === 'u') {
        ctx.strokeStyle = '#9aa3c7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(rect.x + 8, rect.y + rect.height / 2);
        ctx.lineTo(rect.x + rect.width - 8, rect.y + rect.height / 2);
        ctx.stroke();
      }
      if (brick.type === 'x') {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✦', rect.x + rect.width / 2, rect.y + rect.height / 2 + 0.5);
      }
      if (brick.hp < brick.maxHp && brick.maxHp !== Infinity) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`×${brick.hp}`, rect.x + rect.width / 2, rect.y + rect.height / 2 + 0.5);
      }
    });
  }

  drawPaddle(ctx, world, time) {
    const paddle = world.paddle;
    const gradient = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.width, 0);
    gradient.addColorStop(0, '#39d0ff');
    gradient.addColorStop(0.5, '#e8ecff');
    gradient.addColorStop(1, '#c86bff');
    ctx.save();
    ctx.shadowColor = '#39d0ff';
    ctx.shadowBlur = 16;
    ctx.fillStyle = gradient;
    roundRect(ctx, paddle.x, PADDLE.y, paddle.width, PADDLE.height, PADDLE.radius);
    ctx.fill();
    ctx.restore();
    if (world.effects.laser > 0) {
      ctx.fillStyle = '#ffd32a';
      ctx.beginPath();
      ctx.arc(paddle.x + 8, PADDLE.y - 4, 4, 0, Math.PI * 2);
      ctx.arc(paddle.x + paddle.width - 8, PADDLE.y - 4, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (world.effects.fire > 0) {
      ctx.fillStyle = `rgba(255, 159, 67, ${0.5 + 0.4 * Math.sin(time * 10)})`;
      ctx.beginPath();
      ctx.arc(paddle.x + paddle.width / 2, PADDLE.y - 2, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawBalls(ctx, world) {
    world.balls.forEach((ball) => {
      const gradient = ctx.createRadialGradient(
        ball.x - 3, ball.y - 3, 1, ball.x, ball.y, BALL.radius + 6,
      );
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.45, '#9beaff');
      gradient.addColorStop(1, 'rgba(57, 208, 255, 0)');
      ctx.save();
      ctx.shadowColor = '#39d0ff';
      ctx.shadowBlur = 18;
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (world.effects.fire > 0) {
        ctx.strokeStyle = 'rgba(255, 159, 67, 0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BALL.radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }

  drawPowerups(ctx, world, time) {
    world.powerups.forEach((drop) => {
      const def = POWERUPS[drop.key];
      const bob = Math.sin(time * 6 + drop.sway) * 2;
      ctx.save();
      ctx.shadowColor = def.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = def.color;
      roundRect(ctx, drop.x - 15, drop.y - 11 + bob, 30, 22, 11);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#10142a';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.key, drop.x, drop.y + bob + 0.5);
    });
  }

  drawBolts(ctx, world) {
    ctx.fillStyle = '#ffe66d';
    world.bolts.forEach((bolt) => {
      ctx.save();
      ctx.shadowColor = '#ffd32a';
      ctx.shadowBlur = 10;
      roundRect(ctx, bolt.x - 2, bolt.y - 12, 4, 14, 2);
      ctx.fill();
      ctx.restore();
    });
  }

  drawParticles(ctx, world) {
    world.particles.forEach((particle) => {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      if (particle.shard) {
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.life * 6);
        ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
  }

  drawTexts(ctx, world) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    world.texts.forEach((text) => {
      ctx.globalAlpha = clamp(text.life / text.maxLife, 0, 1);
      ctx.fillStyle = text.color;
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText(text.text, text.x, text.y);
    });
    ctx.globalAlpha = 1;
  }

  drawHud(ctx, world, best) {
    ctx.fillStyle = 'rgba(7, 10, 26, 0.72)';
    ctx.fillRect(0, 0, FIELD.width, 56);
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(0, 56, FIELD.width, 2);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.hudDim;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('SCORE', 24, 18);
    ctx.fillStyle = COLORS.hud;
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText(String(world.score).padStart(6, '0'), 24, 40);
    ctx.fillStyle = COLORS.hudDim;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('BEST', 220, 18);
    ctx.fillStyle = COLORS.hud;
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText(String(Math.max(best, world.score)).padStart(6, '0'), 220, 40);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.hudDim;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('LEVEL', FIELD.width / 2 - 130, 18);
    ctx.fillStyle = COLORS.hud;
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText(`${world.levelIndex + 1} / ${LEVELS.length}`, FIELD.width / 2 - 130, 40);
    ctx.fillStyle = COLORS.hudDim;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('BRICKS', FIELD.width / 2 + 60, 18);
    ctx.fillStyle = COLORS.hud;
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText(String(world.breakableLeft()), FIELD.width / 2 + 60, 40);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.hudDim;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('LIVES', FIELD.width - 180, 18);
    for (let i = 0; i < Math.max(world.lives, 0); i += 1) {
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath();
      ctx.arc(FIELD.width - 176 + i * 26, 40, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    if (world.multiplier() > 1) {
      ctx.fillStyle = '#ffd32a';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`COMBO ×${world.multiplier()}`, FIELD.width - 60, 40);
    }
    this.drawEffects(ctx, world);
  }

  drawEffects(ctx, world) {
    const active = Object.entries(world.effects).filter(([, seconds]) => seconds > 0);
    if (active.length === 0) return;
    ctx.textAlign = 'left';
    let x = 400;
    active.forEach(([key, seconds]) => {
      const def = POWERUPS[{ wide: 'W', laser: 'L', slow: 'S', sticky: 'T', fire: 'F' }[key]];
      ctx.fillStyle = def.color;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(`${def.key} ${Math.ceil(seconds)}s`, x, 40);
      x += 64;
    });
  }

  panel(ctx, x, y, width, height) {
    ctx.save();
    ctx.fillStyle = 'rgba(10, 13, 34, 0.88)';
    ctx.strokeStyle = 'rgba(57, 208, 255, 0.55)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#39d0ff';
    ctx.shadowBlur = 24;
    roundRect(ctx, x, y, width, height, 16);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  button(ctx, id, label, x, y, width, height, primary) {
    ctx.save();
    ctx.fillStyle = primary ? '#39d0ff' : 'rgba(255,255,255,0.1)';
    ctx.strokeStyle = primary ? '#9beaff' : '#8b93c9';
    ctx.lineWidth = 2;
    if (primary) {
      ctx.shadowColor = '#39d0ff';
      ctx.shadowBlur = 16;
    }
    roundRect(ctx, x, y, width, height, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = primary ? '#071022' : COLORS.text;
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + width / 2, y + height / 2 + 1);
    return { id, x, y, width, height };
  }

  drawTitle(ctx, world, best, time) {
    ctx.fillStyle = 'rgba(5, 7, 18, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const pulse = 1 + 0.02 * Math.sin(time * 2.4);
    ctx.save();
    ctx.translate(FIELD.width / 2, 190);
    ctx.scale(pulse, pulse);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#39d0ff';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#eaf6ff';
    ctx.font = '900 84px system-ui, sans-serif';
    ctx.fillText('PRISM', 0, -40);
    ctx.fillStyle = '#39d0ff';
    ctx.fillText('BREAKER', 0, 44);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.hudDim;
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText('Smash the rainbow wall. Chain combos. Survive all 8 prisms.', FIELD.width / 2, 300);
    ctx.fillStyle = COLORS.text;
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillText('Move: mouse or ← →  ·  Launch: Space or click  ·  Laser: Space  ·  Pause: P  ·  Mute: M', FIELD.width / 2, 340);
    ctx.fillStyle = COLORS.hudDim;
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('Catch falling capsules for power-ups — Wide, Multiball, Laser, Slow, Extra Life, Sticky, Fireball.', FIELD.width / 2, 368);
    if (best > 0) {
      ctx.fillStyle = '#ffd32a';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText(`BEST SCORE  ${best}`, FIELD.width / 2, 408);
    }
    const buttons = [];
    buttons.push(this.button(ctx, 'start', '▶  START GAME', FIELD.width / 2 - 150, 448, 300, 56, true));
    buttons.push(this.button(ctx, 'howto', 'HOW TO PLAY', FIELD.width / 2 - 150, 518, 300, 44, false));
    return buttons;
  }

  drawPaused(ctx) {
    ctx.fillStyle = 'rgba(5, 7, 18, 0.6)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    this.panel(ctx, FIELD.width / 2 - 220, 240, 440, 220);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.font = '900 44px system-ui, sans-serif';
    ctx.fillText('PAUSED', FIELD.width / 2, 300);
    ctx.fillStyle = COLORS.hudDim;
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillText('Take a breath. The prisms wait.', FIELD.width / 2, 344);
    const buttons = [];
    buttons.push(this.button(ctx, 'resume', 'RESUME', FIELD.width / 2 - 190, 384, 180, 48, true));
    buttons.push(this.button(ctx, 'restart', 'RESTART', FIELD.width / 2 + 10, 384, 180, 48, false));
    return buttons;
  }

  drawLevelClear(ctx, world) {
    ctx.fillStyle = 'rgba(5, 7, 18, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    this.panel(ctx, FIELD.width / 2 - 260, 200, 520, 300);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7dff5e';
    ctx.font = '900 40px system-ui, sans-serif';
    ctx.fillText('LEVEL CLEAR!', FIELD.width / 2, 252);
    ctx.fillStyle = COLORS.text;
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText(`“${LEVELS[world.levelIndex].name}” shattered.`, FIELD.width / 2, 296);
    ctx.fillStyle = COLORS.hudDim;
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText(`Clear bonus  +${world.levelClearBonus}`, FIELD.width / 2, 334);
    ctx.fillStyle = COLORS.hud;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(`SCORE  ${world.score}`, FIELD.width / 2, 372);
    ctx.fillStyle = COLORS.hudDim;
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillText(`Next: “${LEVELS[Math.min(world.levelIndex + 1, LEVELS.length - 1)].name}”`, FIELD.width / 2, 408);
    const buttons = [];
    buttons.push(this.button(ctx, 'next', 'NEXT LEVEL  ▶', FIELD.width / 2 - 150, 436, 300, 52, true));
    return buttons;
  }

  drawGameOver(ctx, world, best) {
    ctx.fillStyle = 'rgba(5, 7, 18, 0.62)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    this.panel(ctx, FIELD.width / 2 - 260, 190, 520, 320);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4d6d';
    ctx.font = '900 44px system-ui, sans-serif';
    ctx.fillText('GAME OVER', FIELD.width / 2, 248);
    ctx.fillStyle = COLORS.text;
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText(`You reached level ${world.levelIndex + 1} of ${LEVELS.length}.`, FIELD.width / 2, 296);
    ctx.fillStyle = '#ffd32a';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(`SCORE  ${world.score}`, FIELD.width / 2, 338);
    ctx.fillStyle = COLORS.hudDim;
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText(`Best combo ×${world.bestCombo}   ·   Best score ${Math.max(best, world.score)}`, FIELD.width / 2, 374);
    const isBest = world.score > best && world.score > 0;
    if (isBest) {
      ctx.fillStyle = '#7dff5e';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText('★ NEW BEST SCORE! ★', FIELD.width / 2, 408);
    }
    const buttons = [];
    buttons.push(this.button(ctx, 'restart', '↻  PLAY AGAIN', FIELD.width / 2 - 150, 438, 300, 52, true));
    return buttons;
  }

  drawVictory(ctx, world, best) {
    ctx.fillStyle = 'rgba(5, 7, 18, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    this.panel(ctx, FIELD.width / 2 - 280, 180, 560, 340);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd32a';
    ctx.font = '900 44px system-ui, sans-serif';
    ctx.fillText('★ YOU WIN! ★', FIELD.width / 2, 238);
    ctx.fillStyle = COLORS.text;
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText('All 8 prisms shattered. The wall is yours.', FIELD.width / 2, 286);
    ctx.fillStyle = '#ffd32a';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText(`FINAL SCORE  ${world.score}`, FIELD.width / 2, 332);
    ctx.fillStyle = COLORS.hudDim;
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText(`Best combo ×${world.bestCombo}   ·   Best score ${Math.max(best, world.score)}`, FIELD.width / 2, 372);
    ctx.fillStyle = COLORS.text;
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillText('Thanks for playing Prism Breaker!', FIELD.width / 2, 406);
    const buttons = [];
    buttons.push(this.button(ctx, 'restart', '↻  PLAY AGAIN', FIELD.width / 2 - 150, 444, 300, 52, true));
    return buttons;
  }
}
