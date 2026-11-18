// Prism Breaker — configuration: field, palette, power-ups and level layouts.
// One job: every tunable number and every hand-built level lives here.

export const FIELD = { width: 1280, height: 720 };
export const STEP = 1 / 120;

export const COLORS = {
  background: '#070a1a',
  backgroundEdge: '#0d1230',
  grid: 'rgba(120, 140, 255, 0.05)',
  hud: '#e8ecff',
  hudDim: '#8b93c9',
  accent: '#39d0ff',
  accentWarm: '#ffb347',
  danger: '#ff4d6d',
  text: '#f2f4ff',
};

export const PADDLE = {
  y: 664,
  height: 16,
  width: 120,
  wideWidth: 176,
  speed: 720,
  radius: 8,
};

export const BALL = {
  radius: 8,
  baseSpeed: 470,
  speedPerLevel: 16,
  maxSpeed: 640,
};

export const BRICK = {
  cols: 12,
  width: 92,
  height: 24,
  gap: 8,
  top: 104,
  left: 44,
};

// Row palette: bricks are coloured by row so every level reads as a rainbow wall.
export const ROW_COLORS = [
  '#ff5d8f', '#ff9f43', '#ffd32a', '#7dff5e',
  '#2ee6a8', '#39d0ff', '#7a7cff', '#c86bff',
];

// Brick types: hp and base score. 'u' is unbreakable and gives no score.
export const BRICK_TYPES = {
  n: { hp: 1, score: 50, name: 'prism' },
  h: { hp: 2, score: 100, name: 'hard prism' },
  a: { hp: 3, score: 150, name: 'armored prism' },
  x: { hp: 1, score: 120, name: 'volatile prism' },
  m: { hp: 1, score: 80, name: 'drifter' },
  b: { hp: 1, score: 80, name: 'gift prism' },
  u: { hp: Infinity, score: 0, name: 'voidstone' },
};

// Power-ups that fall from broken bricks. `key` is the letter drawn on the capsule.
export const POWERUPS = {
  W: { name: 'Wide Paddle', color: '#39d0ff', key: 'W', seconds: 12 },
  M: { name: 'Multiball', color: '#ff5d8f', key: 'M', seconds: 0 },
  L: { name: 'Laser Paddle', color: '#ffd32a', key: 'L', seconds: 14 },
  S: { name: 'Slow Ball', color: '#7dff5e', key: 'S', seconds: 8 },
  E: { name: 'Extra Life', color: '#ff4d6d', key: 'E', seconds: 0 },
  T: { name: 'Sticky Paddle', color: '#c86bff', key: 'T', seconds: 12 },
  F: { name: 'Fireball', color: '#ff9f43', key: 'F', seconds: 8 },
};
export const POWERUP_KEYS = Object.keys(POWERUPS);
export const POWERUP_DROP_CHANCE = 0.22;

// Hand-built levels. Each row is 12 characters, one per brick column.
// '.' empty · n normal · h hard · a armored · x volatile · m drifter · b gift · u voidstone
export const LEVELS = [
  {
    name: 'First Light',
    rows: [
      '............',
      '.nnnnnnnnnn.',
      '.nnnnnnnnnn.',
      '..nhnnnnnh..',
      '............',
    ],
  },
  {
    name: 'Twin Peaks',
    rows: [
      '.....nn.....',
      '....nnnn....',
      '...nnhhnn...',
      '..nnnnnnnn..',
      '.nhnnnnnnhn.',
      '............',
    ],
  },
  {
    name: 'The Vault',
    rows: [
      '.aaaaaaaaaa.',
      '.ahnnnnnnha.',
      '.ahnnxxnnha.',
      '.ahnnnnnnha.',
      '.aaaaaaaaaa.',
      '............',
    ],
  },
  {
    name: 'River Run',
    rows: [
      '.mmmmmmmmmm.',
      '.nnnnnnnnnn.',
      '..hnnnnnnh..',
      '...nnbbnn...',
      '............',
    ],
  },
  {
    name: 'Crossfire',
    rows: [
      '.....un.....',
      '.....un.....',
      '..uunnnnuu..',
      '.....un.....',
      '...nnxxnn...',
      '.nhnnnnnnhn.',
    ],
  },
  {
    name: 'Prism Storm',
    rows: [
      '.ahahahahah.',
      '.nnxnnnnxnn.',
      '..mmmmmmmm..',
      '.hnnnbbnnnh.',
      '..ahnnnnha..',
      '............',
    ],
  },
  {
    name: 'The Maze',
    rows: [
      '.uunnnnnnuu.',
      '.unnnnnnnnu.',
      '.unhaxxahnu.',
      '.unnnnnnnnu.',
      '.uunnnnnnuu.',
      '............',
    ],
  },
  {
    name: 'Final Prism',
    rows: [
      '.aaaaaaaaaa.',
      '.axmnnnnmxa.',
      '.ahnxbbxnha.',
      '.ammnnnnmma.',
      '.ahnnxxnnha.',
      '.aaaaaaaaaa.',
    ],
  },
];

export const START_LIVES = 3;
export const MAX_COMBO_MULTIPLIER = 8;
export const LEVEL_CLEAR_BONUS_PER_LEVEL = 250;
export const LEVEL_CLEAR_BONUS_PER_LIFE = 100;

/** Deterministic random generator (mulberry32) so staged screenshots repeat. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
