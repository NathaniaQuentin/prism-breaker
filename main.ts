// Prism Breaker — best-game-01 entry (Node 22, standard library only): the game is this directory's
// game/ folder, plain static files a desktop browser loads offline (game/index.html and its ES
// modules, no library and no network request), and the program hands it in. It copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library.
//
// Before it copies anything it validates the entry it is about to hand in — game/index.html, every
// file the page loads, and the screenshots — and refuses with a clear list of what is missing
// instead of handing in a game that cannot load. After buildDossier it checks the dossier it is
// about to write (schema, cover, text, and every image's sha256 against the screenshot handed in)
// and prints a short summary of what went out.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, DOSSIER_MAX_BYTES, DOSSIER_SCHEMA, htmlFacts, isRelativeRef, resolveGamePath } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/** A screenshot file's name: letters, digits and . _ -, 1 to 128 characters, not starting with . or -. */
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

const opensWith = (bytes: Uint8Array, magic: readonly number[]): boolean =>
  bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);

/** Refuse to hand the entry in, listing every problem found, instead of handing in a broken game. */
function fail(problems: string[]): never {
  console.error(`main.ts: refusing to hand in the entry:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}

const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** One file under a directory: its path relative to it (POSIX) and its bytes. */
interface FoundFile {
  path: string;
  bytes: number;
}

/** Every plain file under `dir`, walked recursively; symbolic links and special files are refused. */
function walkFiles(dir: string, rel = ''): FoundFile[] {
  const found: FoundFile[] = [];
  let entries;
  try {
    entries = readdirSync(rel === '' ? dir : join(dir, rel), { withFileTypes: true });
  } catch (err) {
    fail([`${rel === '' ? dir : `${dir}/${rel}`}: cannot be read (${(err as Error).message})`]);
  }
  for (const e of entries!) {
    const path = rel === '' ? e.name : `${rel}/${e.name}`;
    const full = join(dir, path);
    if (e.isDirectory()) {
      found.push(...walkFiles(dir, path));
    } else if (e.isFile()) {
      found.push({ path, bytes: lstatSync(full).size });
    } else {
      fail([`${full}: a symbolic link or special file (an entry holds plain files and directories only)`]);
    }
  }
  return found;
}

/**
 * The entry beside this file, checked before anything is copied: game/index.html exists, every file
 * the page loads (its scripts, links and media) is a relative reference to a file under game/ (an
 * offline game loads nothing over the network), and screenshots/ holds 3 or 4 PNG or JPEG renders
 * within the byte cap. Returns the game files and the screenshots, for the summary.
 */
function preflight(): { gameFiles: FoundFile[]; shots: FoundFile[] } {
  const problems: string[] = [];
  const gameDir = join(here, 'game');
  if (!existsSync(gameDir) || !lstatSync(gameDir).isDirectory()) {
    fail(['game/: no such directory: a game is a directory of static files, its index.html at its root']);
  }
  const indexPath = join(gameDir, 'index.html');
  if (!existsSync(indexPath) || !lstatSync(indexPath).isFile()) {
    fail(['game/index.html: no such file: a game is a directory of static files, its index.html at its root']);
  }
  const gameFiles = walkFiles(gameDir);

  // Every file the page loads must be a file of the game: a reference the browser cannot resolve
  // (or one that fetches over the network) is a game that does not load.
  const html = readFileSync(indexPath, 'utf8');
  const facts = htmlFacts(html);
  const refs: { kind: string; ref: string }[] = [
    ...facts.scripts.filter((s) => s.src !== null).map((s) => ({ kind: 'script', ref: s.src! })),
    ...facts.links.map((l) => ({ kind: 'link', ref: l.href })),
    ...facts.resources.map((r) => ({ kind: r.tag, ref: r.src })),
  ];
  for (const { kind, ref } of refs) {
    if (!isRelativeRef(ref)) {
      problems.push(`game/index.html: <${kind}> loads ${JSON.stringify(ref)} over the network (an offline game loads nothing but its own files)`);
      continue;
    }
    const target = resolveGamePath(ref, 'index.html');
    if (target === null || !gameFiles.some((f) => f.path === target)) {
      problems.push(`game/index.html: <${kind}> ${JSON.stringify(ref)} names no file under game/`);
    }
  }

  const shotsDir = join(here, 'screenshots');
  let shots: FoundFile[] = [];
  if (!existsSync(shotsDir) || !lstatSync(shotsDir).isDirectory()) {
    problems.push('screenshots/: no such directory: an entry hands in 3 or 4 renders of its game, the first by name the cover');
  } else {
    const names = readdirSync(shotsDir, { withFileTypes: true }).filter((e) => e.isFile() && !e.name.startsWith('.')).map((e) => e.name).sort();
    if (names.length < 3 || names.length > CAPS.screenshots.max) {
      problems.push(`screenshots/: holds ${names.length} renders, an entry hands in 3 or 4`);
    }
    for (const name of names) {
      const full = join(shotsDir, name);
      const bytes = new Uint8Array(readFileSync(full));
      if (!IMAGE_NAME.test(name)) problems.push(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters, not starting with . or -`);
      if (bytes.length > CAPS.screenshots.max_bytes) problems.push(`screenshots/${name} is ${bytes.length} bytes, over the ${CAPS.screenshots.max_bytes} allowed`);
      if (!opensWith(bytes, PNG_MAGIC) && !opensWith(bytes, JPEG_MAGIC)) problems.push(`screenshots/${name} is neither a PNG nor a JPEG`);
    }
    shots = names.map((name) => ({ path: name, bytes: lstatSync(join(shotsDir, name)).size }));
  }
  if (problems.length > 0) fail(problems);
  return { gameFiles, shots };
}

const { gameFiles, shots } = preflight();

mkdirSync(out, { recursive: true });
// A previous run's output must not survive into this one: cpSync merges, so a stale game/,
// screenshots/ or dossier.json left behind by a failed run would be handed in as if it were
// this run's. Only these three paths are removed, never the output directory itself.
for (const stale of [join(out, 'game'), join(out, 'screenshots'), join(out, 'dossier.json')]) {
  rmSync(stale, { recursive: true, force: true });
}
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The dossier buildDossier writes for the output just copied. It is checked before it is written:
// the scorer requires dossier.json to equal what buildDossier writes, so a dossier that does not
// describe what was handed in must fail here, not after it is submitted.
const dossierBytes = buildDossier(out, CAPS);
let dossier: unknown;
try {
  dossier = JSON.parse(new TextDecoder('utf-8').decode(dossierBytes));
} catch {
  fail(['dossier.json: buildDossier returned bytes that are not JSON']);
}
const doc = dossier as { schema?: unknown; cover?: unknown; text?: unknown; images?: unknown };
const dossierProblems: string[] = [];
if (doc.schema !== DOSSIER_SCHEMA) dossierProblems.push(`dossier.json: schema is ${JSON.stringify(doc.schema)}, not ${JSON.stringify(DOSSIER_SCHEMA)}`);
if (doc.cover !== 0) dossierProblems.push(`dossier.json: cover is ${JSON.stringify(doc.cover)}, not 0 (the first screenshot by name)`);
if (typeof doc.text !== 'string' || !doc.text.startsWith('## Game')) dossierProblems.push('dossier.json: text is not the "## Game" block buildDossier writes');
if (!Array.isArray(doc.images) || doc.images.length !== shots.length) {
  dossierProblems.push(`dossier.json: holds ${Array.isArray(doc.images) ? doc.images.length : 'no'} images for ${shots.length} screenshots handed in`);
} else {
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i]!;
    const image = doc.images[i] as { name?: unknown; media_type?: unknown; sha256?: unknown };
    const copied = new Uint8Array(readFileSync(join(out, 'screenshots', shot.path)));
    if (image.name !== shot.path) dossierProblems.push(`dossier.json: image ${i} is named ${JSON.stringify(image.name)}, not ${JSON.stringify(shot.path)}`);
    if (image.media_type !== 'image/png' && image.media_type !== 'image/jpeg') dossierProblems.push(`dossier.json: image ${shot.path} has media type ${JSON.stringify(image.media_type)}`);
    if (image.sha256 !== sha256Hex(copied)) dossierProblems.push(`dossier.json: image ${shot.path} has a sha256 that does not match the screenshot handed in`);
  }
}
if (dossierBytes.length > DOSSIER_MAX_BYTES) dossierProblems.push(`dossier.json: ${dossierBytes.length} bytes, over the ${DOSSIER_MAX_BYTES} one holds`);
if (dossierProblems.length > 0) fail(dossierProblems);

writeFileSync(join(out, 'dossier.json'), dossierBytes);

const gameBytes = gameFiles.reduce((n, f) => n + f.bytes, 0);
const shotBytes = shots.reduce((n, f) => n + f.bytes, 0);
console.log(
  [
    'Prism Breaker handed in:',
    `  game/: ${gameFiles.length} files, ${gameBytes} bytes`,
    `  screenshots/: ${shots.length} images, ${shotBytes} bytes`,
    `  dossier.json: ${dossierBytes.length} bytes (${DOSSIER_SCHEMA}, ${shots.length} images)`,
    `  output: ${out}`,
  ].join('\n'),
);
