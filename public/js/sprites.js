// Procedural pixel art. Every sprite is an ASCII map + palette rendered into a small canvas.
// Many sprites are left-right symmetric: we store the left half and mirror it.
import { CHARACTERS, ENEMIES, ENEMY_LIST, PASSIVES, WEAPONS } from '/shared/data.js';

export const PX = 2; // world units per art pixel

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function mirrorRows(rows) { return rows.map(r => r + [...r].reverse().join('')); }

export function makeSprite(rows, pal, mirror = false) {
  const full = mirror ? mirrorRows(rows) : rows;
  const h = full.length, w = Math.max(...full.map(r => r.length));
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    const row = full[y];
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

function flipped(src) {
  const c = canvas(src.width, src.height);
  const ctx = c.getContext('2d');
  ctx.translate(src.width, 0); ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}

function tinted(src, color, alpha = 1) {
  const c = canvas(src.width, src.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

// ------------------------------------------------------------------ humanoid parts
const HEADS = {
  hair: ['........', '........', '.....ooo', '....ohhh', '...ohhhh', '...ohhss', '...ohses', '...ohsss', '....osss'],
  wizard: ['.......o', '......oh', '.....ohh', '....ohhH', '..ooaaaa', 'oohhhhhh', '...ohses', '...ohsss', '....osss'],
  hood: ['........', '........', '......oo', '....oohh', '...ohhhh', '..ohhHss', '..ohHses', '..ohHsss', '..ohhoss'],
  helm: ['........', '.......a', '.....ooa', '....ohhh', '...ohHhh', '...ohhhh', '...ohoeo', '...ohhhh', '....ohhh'],
  skull: ['........', '........', '.....ooo', '....owww', '...owwww', '...owwww', '...owEEw', '...owwwE', '....owow'],
  wolf: ['...o....', '...oo...', '...oho..', '...ohhoo', '..ohhhhh', '..ohhhhh', '..ohehhh', '...ohhSS', '....oSSS'],
  wrap: ['........', '........', '.....ooo', '....ohHh', '...ohhHh', '...oHhhH', '...ohehh', '...oHhhH', '....ohHh'],
};
const BODIES = {
  normal: ['...oCccc', '..oCcccc', '..osCcaa', '..ooaaaa', '...opppp'],
  ribs: ['....oCwC', '...owCwC', '..owoCwC', '..oo.oww', '....owww'],
  robe: ['...oCccc', '..oCcccc', '..oCcccc', '..oCcccc', '..oCcccc'],
};
const LEGS = {
  normal: [
    ['...oppo..oppo...', '...obbo..obbo...', '...oooo..oooo...', '................'],
    ['...obbo..oppo...', '...oooo..obbo...', '.........oooo...', '................'],
    ['...oppo..obbo...', '...obbo..oooo...', '...oooo.........', '................'],
  ],
  robe: [
    ['..oCccccccccCo..', '..oCccCccCccCo..', '..ocCoccoccoCco.', '...o..o..o..o...'],
    ['..oCccccccccCo..', '..oCccCccCccCo..', '..oCcocCcoCcco..', '...oo..o..o.oo..'],
    ['..oCccccccccCo..', '..oCccCccCccCo..', '..oCcocCcoCcco..', '...oo..o..o.oo..'],
  ],
};

function humanoid(look, frame) {
  const head = mirrorRows(HEADS[look.head || 'hair']);
  const body = mirrorRows(BODIES[look.body || 'normal']);
  const legs = LEGS[look.legs || 'normal'][frame];
  const pal = {
    o: look.o || '#140c1c', h: look.h, H: look.H || look.h, s: look.s || '#f0c8a0', S: look.S || look.s || '#d8a880',
    e: look.e || '#140c1c', E: look.E || '#140c1c', c: look.c, C: look.C || look.c, a: look.a, p: look.p, b: look.b,
    w: look.w || look.c,
  };
  return makeSprite([...head, ...body, ...legs], pal);
}

// ------------------------------------------------------------------ enemies
const BAT = [
  ['o.......', 'oo......', 'owo..o..', 'owwwoobb', '.owwobeb', '..owobbb', '...oobBB', '.....obb', '......o.', '........', '........'],
  ['........', '........', '.....o..', '....oobb', '...oobeb', '..owobbb', '.owwobBB', 'owwwwobb', 'owww..o.', 'oo......', 'o.......'],
];
const GHOST = [
  ['........', '.....ooo', '....owww', '...owwww', '..owwwww', '..owwwww', '..owwEEw', '..owwEEw', '.owwwwww', '.owwwwwo', '.owwwwww', 'owwowwow', 'oo.oo.oo'],
  ['........', '.....ooo', '....owww', '...owwww', '..owwwww', '..owwwww', '..owwEEw', '..owwEEw', '.owwwwww', '.owwwwwo', '.owwwwww', 'owowwowo', 'o.oo.oo.'],
];
const SLIME = ['........', '........', '........', '.....ooo', '...oollg', '..olgggg', '.olggggg', '.ogggegg', '.ogggggg', 'oGgggggg', 'oGGggggg', '.oGGGGGG', '..oooooo'];
const EYE = ['....ooo', '..oowww', '.owrwww', '.owwwii', 'owwwiip', 'owwwiip', '.owwwii', '.owrwww', '..oowww', '....ooo'];

const LOOKS = {
  zombie: { head: 'hair', h: '#3a4a2a', H: '#2a3a1a', s: '#7a9a5a', S: '#5a7a40', e: '#d02020', c: '#5a4a6a', C: '#3a2e4a', a: '#4a3a2a', p: '#3a3a4a', b: '#2a2a2a' },
  skeleton: { head: 'skull', body: 'ribs', w: '#e8e0d0', C: '#8a8070', c: '#e8e0d0', E: '#1a1020', s: '#e8e0d0', a: '#8a8070', p: '#d8d0c0', b: '#b8b0a0', o: '#2a2420' },
  mummy: { head: 'wrap', h: '#d8cca0', H: '#a89870', e: '#ffd040', c: '#d8cca0', C: '#a89870', a: '#8a7a50', s: '#c8bc90', p: '#c8bc90', b: '#a89870', o: '#2a2010' },
  knight: { head: 'helm', h: '#8a94a0', H: '#c0c8d0', e: '#ff4040', c: '#6a7480', C: '#4a5460', a: '#c0a040', s: '#8a94a0', p: '#4a5460', b: '#3a3a44' },
  werewolf: { head: 'wolf', h: '#6a4a3a', H: '#4a3020', e: '#ffe040', S: '#a08060', c: '#6a4a3a', C: '#4a3020', a: '#3a2a4a', s: '#6a4a3a', p: '#3a2a4a', b: '#4a3020' },
  yeti: { head: 'wolf', h: '#e8f0f8', H: '#a8b8c8', e: '#2080ff', S: '#b8c8d8', c: '#e8f0f8', C: '#a8b8c8', a: '#8898a8', s: '#e8f0f8', p: '#c8d8e8', b: '#8898a8', o: '#304050' },
  wraith: { head: 'hood', body: 'robe', legs: 'robe', h: '#3a2a4a', H: '#1a1028', s: '#140a20', S: '#140a20', e: '#ff50ff', c: '#4a3a5a', C: '#2a1a3a' },
  icewraith: { head: 'hood', body: 'robe', legs: 'robe', h: '#4a6a8a', H: '#2a4a6a', s: '#0a1a2a', S: '#0a1a2a', e: '#80f0ff', c: '#5a7a9a', C: '#3a5a7a' },
  nightlord: { head: 'hood', body: 'robe', legs: 'robe', h: '#6a1020', H: '#3a0810', s: '#12000a', S: '#12000a', e: '#ffe040', c: '#8a1a2a', C: '#4a0a14' },
  colossus: { head: 'skull', body: 'ribs', w: '#d8ccb8', C: '#6a5a48', c: '#d8ccb8', E: '#ff3020', s: '#d8ccb8', a: '#6a5a48', p: '#c8bca8', b: '#a8988a', o: '#1a1410' },
  frostgiant: { head: 'wolf', h: '#a8c8e8', H: '#6888b0', e: '#ffffff', S: '#88a8c8', c: '#a8c8e8', C: '#6888b0', a: '#4a6890', s: '#a8c8e8', p: '#88a8c8', b: '#4a6890', o: '#102030' },
};
const BAT_PALS = {
  bat: { o: '#1a0f22', w: '#3c2350', b: '#5c3878', B: '#8a5ca8', e: '#ff4848' },
  icebat: { o: '#0a1a2a', w: '#2a4a6a', b: '#4a7aa8', B: '#8ac0e8', e: '#e0ffff' },
  batlord: { o: '#1a0408', w: '#4a1018', b: '#7a1a28', B: '#b03040', e: '#ffe040' },
};
const SLIME_PALS = {
  slime: { o: '#12301a', g: '#3cc050', l: '#a8f0a8', G: '#208038', e: '#0a200e' },
  mudman: { o: '#2a1a0a', g: '#7a5a3a', l: '#b09070', G: '#4a3420', e: '#ffd040' },
  frostslime: { o: '#0a2030', g: '#6ac8e8', l: '#e0faff', G: '#3a88b0', e: '#0a2030' },
};

// enemy sprite sets: frames[] of { r: right-facing, l: left-facing, flash, flashL, ice, iceL }
export const ENEMY_SPR = [];
export const ENEMY_ANIM = []; // frame sequence per type

function variantSet(c) {
  const l = flipped(c);
  return { r: c, l, fr: tinted(c, '#ffffff'), fl: tinted(l, '#ffffff'), ir: tinted(c, '#7fd0ff', 0.55), il: tinted(l, '#7fd0ff', 0.55) };
}

function buildEnemy(type) {
  const spr = ENEMIES[type].sprite;
  let frames;
  if (BAT_PALS[spr]) frames = BAT.map(f => makeSprite(f, BAT_PALS[spr], true));
  else if (spr === 'ghost') frames = GHOST.map(f => makeSprite(f, { o: '#3a4a6a', w: '#dfe8f8', E: '#1a1030' }, true));
  else if (SLIME_PALS[spr]) {
    const base = makeSprite(SLIME, SLIME_PALS[spr], true);
    // second frame: squished
    const sq = canvas(base.width, base.height);
    const x = sq.getContext('2d');
    x.drawImage(base, -1, 1, base.width + 2, base.height - 1);
    frames = [base, sq];
  } else if (spr === 'eye') {
    const base = makeSprite(EYE, { o: '#3a0a14', w: '#f4ece4', i: '#c8243c', p: '#140608', r: '#e05060' }, true);
    frames = [base, base];
  } else if (spr === 'brazier') {
    frames = [makeSprite(['.oooo', 'oaaaa', '.oaAa', '..oaa', '...oa', '...oa', '...oa', '..ooa', '.oaaa', '.oooo'], { o: '#1a1010', a: '#7a5a3a', A: '#a88050' }, true)];
  } else {
    const look = LOOKS[spr];
    frames = [0, 1, 0, 2].map(i => humanoid(look, i));
  }
  return frames.map(variantSet);
}

// ------------------------------------------------------------------ characters
export const CHAR_SPR = {}; // id -> [4 frames] of { r, l, fr, fl }
function buildChars() {
  for (const ch of CHARACTERS) {
    const look = { ...ch.look };
    if (look.head === 'helm') look.e = '#8af0ff';
    CHAR_SPR[ch.id] = [0, 1, 0, 2].map(i => {
      const c = humanoid(look, i);
      const l = flipped(c);
      return { r: c, l, fr: tinted(c, '#ffffff'), fl: tinted(l, '#ffffff'), hr: tinted(c, '#ff3040', 0.6), hl: tinted(l, '#ff3040', 0.6) };
    });
  }
}

// ------------------------------------------------------------------ pickups
const GEM = ['...oo...', '..olgo..', '.ollggo.', 'olggggGo', '.ogggGo.', '..ogGo..', '...oo...'];
export const PICKUP_SPR = {};
function buildPickups() {
  PICKUP_SPR.gem1 = makeSprite(GEM, { o: '#0a2a5a', l: '#d8f4ff', g: '#48a8ff', G: '#2060c0' });
  PICKUP_SPR.gem2 = makeSprite(GEM, { o: '#0a3a1a', l: '#d8ffd8', g: '#40d860', G: '#20903a' });
  PICKUP_SPR.gem3 = makeSprite(GEM, { o: '#4a0a10', l: '#ffd8d8', g: '#ff4050', G: '#b01828' });
  PICKUP_SPR.coin = makeSprite(['..oooo..', '.oyyyyo.', 'oyYyyyDo', 'oyYyDyDo', 'oyYyDyDo', 'oyyyyyDo', '.oDDDDo.', '..oooo..'],
    { o: '#5a3a00', y: '#ffd040', Y: '#fff0a0', D: '#c08a10' });
  PICKUP_SPR.bag = makeSprite(['...o..o...', '....oo....', '...oaao...', '..oyyyyo..', '.oyYyyyDo.', 'oyYyyyyyDo', 'oyYyyyyyDo', 'oyyyyyyDDo', '.oyyyyDDo.', '..oooooo..'],
    { o: '#3a2400', y: '#c89040', Y: '#f0c878', D: '#8a5a20', a: '#ffd040' });
  PICKUP_SPR.chicken = makeSprite(['......oooo..', '.....obbbbo.', '....obBBbbbo', '....obBbbbbo', '....obbbbbbo', '...oobbbbbo.', '..owoobbboo.', '.owwo.oooo..', 'owwo........', 'ooo.........'],
    { o: '#3a1a08', b: '#c8702a', B: '#f0a860', w: '#f0e8d8' });
  PICKUP_SPR.magnet = makeSprite(['oooo..oooo', 'owwo..owwo', 'orro..orro', 'orro..orro', 'orro..orro', 'orrooooRRo', '.orrrrRRo.', '..oooooo..'],
    { o: '#2a0808', w: '#e0e8f0', r: '#e03030', R: '#a01818' });
  PICKUP_SPR.relic = makeSprite(['...oo', '...oy', '...oy', 'ooooy', 'oyyyY', 'ooooy', '...oy', '...oy', '...oy', '...oo'],
    { o: '#5a3a00', y: '#ffe060', Y: '#fff8c0' }, true);
  PICKUP_SPR.clock = makeSprite(['...oooo...', '..owwwwo..', '.owwwkwwo.', 'owwwwkwwwo', 'owwwwkwwwo', 'owwwwkkkwo', 'owwwwwwwwo', '.owwwwwwo.', '..owwwwo..', '...oooo...'],
    { o: '#1a3a5a', w: '#d8f0ff', k: '#1a2a4a' });
  PICKUP_SPR.chest = makeSprite(['..oooooooooo..', '.oBbbbbbbbbbo.', 'oBbbbbbbbbbbbo', 'oyyyyyyyyyyyyo', 'oBbbbbyybbbbbo', 'ooooooyyoooooo',
    'oBbbbbyybbbbbo', 'obbbbbbbbbbbbo', 'oyyyyyyyyyyyyo', 'obbbbbbbbbbbbo', 'oDDDDDDDDDDDDo', '.oooooooooooo.'],
    { o: '#2a1408', b: '#9a5a28', B: '#c8844a', D: '#6a3a18', y: '#ffd040' });
}

// ------------------------------------------------------------------ projectiles
export const PROJ_SPR = {};
const book = ['.oooo', 'orrrr', 'orrra', 'orraa', 'orrra', 'orrrr', 'owwww', '.oooo'];
function glow(r, inner, outer) {
  const c = canvas(r * 2, r * 2);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, inner);
  g.addColorStop(0.6, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, r * 2, r * 2);
  return c;
}
function buildProjectiles() {
  const knife = ['oo..........', 'obooooooooo.', 'obbaSSSSSSSo', 'obooooooooo.', 'oo..........'];
  PROJ_SPR.knife = makeSprite(knife, { o: '#1a1a24', b: '#8a5a2a', a: '#e0b040', S: '#e8eef4' });
  PROJ_SPR.blade = makeSprite(knife, { o: '#0a2a3a', b: '#3a2a5a', a: '#80f0ff', S: '#c8fcff' });
  const axe = ['...ooooo....', '..oSSSSSo...', '.oSSSSSSSo..', 'oSSSsSSSSo..', 'oSSsSSSSwo..', 'oSSSSSSwwo..', '.oSSSSowwo..',
    '..oooowwo...', '......owwo..', '.......owwo.', '........owwo', '.........ooo'];
  PROJ_SPR.axe = makeSprite(axe, { o: '#1a1a24', S: '#c8d0d8', s: '#ffffff', w: '#8a5a2a' });
  PROJ_SPR.spiral = makeSprite(axe, { o: '#2a0810', S: '#e04060', s: '#ffd0e0', w: '#3a1a2a' });
  const cross = ['....oo', '....oy', '....oy', '....oy', 'oooooy', 'oyyyyY', 'oyyyyY', 'oooooy', '....oy', '....oy', '....oy', '....oo'];
  PROJ_SPR.cross = makeSprite(cross, { o: '#5a3a00', y: '#ffd84a', Y: '#fff4b0' }, true);
  PROJ_SPR.heaven = makeSprite(cross, { o: '#1a3a6a', y: '#a8e8ff', Y: '#ffffff' }, true);
  PROJ_SPR.book = makeSprite(book, { o: '#1a0a0a', r: '#a02030', a: '#ffd040', w: '#f0e8d0' }, true);
  PROJ_SPR.ebook = makeSprite(book, { o: '#0a0a2a', r: '#4a38c0', a: '#ffe880', w: '#f0f0ff' }, true);
  const flask = ['..oo', '..oc', '..ow', '.oww', 'owll', 'olll', 'olLL', '.oLL', '..oo'];
  PROJ_SPR.flask = makeSprite(flask, { o: '#102040', c: '#8a5a2a', w: '#d8e8f8', l: '#60b8ff', L: '#3080e0' }, true);
  PROJ_SPR.fflask = makeSprite(flask, { o: '#402a00', c: '#8a5a2a', w: '#fff8e0', l: '#ffe070', L: '#e0a020' }, true);
  const rune = ['...o', '..oc', '.occ', 'occW', 'occW', '.occ', '..oc', '...o'];
  PROJ_SPR.rune = makeSprite(rune, { o: '#2a1060', c: '#b070ff', W: '#f4e8ff' }, true);
  PROJ_SPR.srune = makeSprite(rune, { o: '#500a30', c: '#ff60c0', W: '#fff0f8' }, true);
  PROJ_SPR.bolt = glow(12, '#b8e8ff', 'rgba(80,140,255,0.55)');
  PROJ_SPR.torrent = glow(12, '#ffd8ff', 'rgba(200,90,255,0.6)');
  PROJ_SPR.fireball = glow(16, '#ffe080', 'rgba(255,90,20,0.65)');
  PROJ_SPR.inferno = glow(16, '#fff0a0', 'rgba(255,40,40,0.7)');
  PROJ_SPR.glowWhite = glow(16, '#ffffff', 'rgba(255,255,255,0.35)');
  PROJ_SPR.glowGold = glow(16, '#fff0a0', 'rgba(255,200,60,0.4)');
  PROJ_SPR.glowRed = glow(16, '#ffb0b0', 'rgba(255,40,60,0.45)');
  PROJ_SPR.glowFire = glow(16, '#ffd070', 'rgba(255,120,20,0.5)');
}

// ------------------------------------------------------------------ icons (weapons + passives)
export const ICONS = {};
function buildIcons() {
  ICONS.whip = makeSprite(['..oooo......', '.obbbbo.....', 'ob....bo....', 'ob....bo....', '.ob..bo.....', '..obbo......', '...oboo.....',
    '....obbo....', '.....ohho...', '......ohho..', '.......ohho.', '........oo..'], { o: '#1a0a04', b: '#a0603a', h: '#5a3418' });
  const wand = ['.........y..', '........yWy.', '.........y..', '........oo..', '.......owo..', '......owo...', '.....owo....',
    '....obo.....', '...obo......', '..obo.......', '.obo........', 'ooo.........'];
  ICONS.wand = makeSprite(wand, { o: '#1a1030', w: '#b0a0f0', b: '#5a4a9a', y: '#ffe060', W: '#ffffff' });
  ICONS.firewand = makeSprite(wand, { o: '#2a0a04', w: '#f07030', b: '#a02810', y: '#ff9020', W: '#fff080' });
  ICONS.knife = PROJ_SPR.knife;
  ICONS.axe = PROJ_SPR.axe;
  ICONS.boomerang = PROJ_SPR.cross;
  ICONS.orbit = PROJ_SPR.book;
  ICONS.water = PROJ_SPR.flask;
  ICONS.rune = PROJ_SPR.rune;
  ICONS.garlic = makeSprite(['.....o', '....og', '...owg', '..owww', '.owwWw', 'owwwWw', 'owwwWw', 'owwwww', '.owwww', '..oooo'],
    { o: '#3a3020', w: '#f4f0e4', W: '#c8c0b0', g: '#80b040' }, true);
  ICONS.lightning = makeSprite(['...ooo', '..oyyy', '.oyooo', 'oyo..b', 'oyo.bb', 'oyo.bo', '.oyooo', '..oyyy', '...ooo'],
    { o: '#4a3000', y: '#ffd040', b: '#80e0ff' }, true);
  // evolutions reuse their base weapon's icon (drawn with a gold frame in the UI)
  ICONS.crimson = makeSprite(['..oooo......', '.obbbbo.....', 'ob....bo....', 'ob....bo....', '.ob..bo.....', '..obbo......', '...oboo.....',
    '....obbo....', '.....ohho...', '......ohho..', '.......ohho.', '........oo..'], { o: '#1a0004', b: '#e02040', h: '#801020' });
  ICONS.torrent = makeSprite(wand, { o: '#1a0a30', w: '#f0a0ff', b: '#9030c0', y: '#ffb0ff', W: '#ffffff' });
  ICONS.blades = PROJ_SPR.blade;
  ICONS.spiral = PROJ_SPR.spiral;
  ICONS.heaven = PROJ_SPR.heaven;
  ICONS.eternal = PROJ_SPR.ebook;
  ICONS.inferno = makeSprite(wand, { o: '#2a0000', w: '#ff4020', b: '#800808', y: '#ff2020', W: '#ffe060' });
  ICONS.siphon = makeSprite(['.....o', '....og', '...owg', '..owww', '.owwWw', 'owwwWw', 'owwwWw', 'owwwww', '.owwww', '..oooo'],
    { o: '#200a30', w: '#d8b0ff', W: '#9060d0', g: '#ff60a0' }, true);
  ICONS.flood = PROJ_SPR.fflask;
  ICONS.thunder = makeSprite(['...ooo', '..oyyy', '.oyooo', 'oyo..b', 'oyo.bb', 'oyo.bo', '.oyooo', '..oyyy', '...ooo'],
    { o: '#003040', y: '#80f0ff', b: '#ffffff' }, true);
  ICONS.singularity = PROJ_SPR.srune;

  ICONS.whetstone = makeSprite(['............', '...oooooo...', '..oSSSSSSo..', '.oSsSSSSSSo.', 'oSSSsSSSSSSo', 'oSSSSSSSSSSo', 'oDSSSSSSSSDo', '.oDDDDDDDDo.', '..oooooooo..'],
    { o: '#1a1a24', S: '#8a9098', s: '#e0e4ea', D: '#5a6068' });
  ICONS.plate = makeSprite(['..oo..', '.oSSoo', 'oSSSSS', 'oSsSSS', 'oSsSSS', '.oSSSS', '.oSSSa', '..oSSS', '...ooo'],
    { o: '#1a1a24', S: '#a8b0bc', s: '#e8ecf0', a: '#e0b040' }, true);
  ICONS.heart = makeSprite(['.oooo.', 'orrrro', 'orWrrr', 'orrrrr', 'orrrrr', '.orrrr', '..orrr', '...orr', '....or', '.....o'],
    { o: '#3a0810', r: '#e03048', W: '#ffc0c8' }, true);
  ICONS.herb = makeSprite(['........oo..', '......oogGo.', '.....ogggGo.', '....ogggGGo.', '...ogggGGo..', '..ogggGGo...', '..oggGGo....', '.ooGGoo.....', 'ob.oo.......', 'b...........'],
    { o: '#0a2a10', g: '#50c050', G: '#2a8a30', b: '#6a4a2a' });
  ICONS.tome = makeSprite(book, { o: '#0a1a2a', r: '#2a70c0', a: '#a0f0ff', w: '#f0f0ff' }, true);
  ICONS.candelabra = makeSprite(['.....o', '....oy', '....oY', '.....o', '....ow', '....ow', '....ow', '....ow', '..oooo', '.oaaaa', '..oaaa', '...ooo'],
    { o: '#2a1a08', y: '#ffb020', Y: '#fff0a0', w: '#f0e8d8', a: '#d0a040' }, true);
  ICONS.bracer = makeSprite(['............', '...oooooo...', '..oBbbbbbo..', '..oaaaaaao..', '..obbbbbbo..', '..obBbbbbo..', '..oaaaaaao..', '..obbbbbbo..', '...oooooo...'],
    { o: '#1a0a04', b: '#9a6a3a', B: '#d0a070', a: '#e0c060' });
  ICONS.hourglass = makeSprite(['oooooo', '.oyyyy', '..oyyy', '...oyy', '....oy', '....ow', '...oww', '..owwy', '.owyyy', 'oooooo'],
    { o: '#4a2a10', y: '#f0c060', w: '#d8f0ff' }, true);
  ICONS.mirror = makeSprite(['......o.....', '.....owo....', '....owWwo...', '...owWwwwo..', '..owWwwwwwo.', '...owwwwwo..', '....owwwo...', '.....owo....', '......o.....'],
    { o: '#1a3a5a', w: '#a8d8f0', W: '#ffffff' });
  ICONS.boots = makeSprite(['......ww....', '....owwwww..', '...oBwwww...', '...oBBo.....', '...oBBo.....', '...oBBo.....', '..oBBBBoo...', '.oBBBBBBBo..', '.oooooooooo.'],
    { o: '#2a1408', B: '#9a6030', w: '#f0f0ff' });
  ICONS.lodestone = makeSprite(['..oooo', '.oPPpp', 'oPPppp', 'oPpppp', 'oppppp', 'oppppp', '.opppp', '..oooo'],
    { o: '#200a30', p: '#8040c0', P: '#d8b0ff' }, true);
  ICONS.clover = makeSprite(['...oo.oo....', '..oggoggo...', '..ogGgGgo...', '.oogggggoo..', 'oggGgogGggo.', 'ogggggggggo.', '.oogggggoo..', '...oobo.....', '.....ob.....', '......b.....'],
    { o: '#0a2a10', g: '#40c050', G: '#a0f0a0', b: '#4a8a3a' });
  ICONS.crown = makeSprite(['o....o', 'oo..oy', 'oyooyy', 'oyyyyy', 'oyryyy', 'oyyyyy', 'oooooo'],
    { o: '#5a3a00', y: '#ffd040', r: '#e03048' }, true);
  ICONS.gold = PICKUP_SPR.bag;
  ICONS.heal = PICKUP_SPR.chicken;
  ICONS.skull = makeSprite(['..oooo', '.owwww', 'owwwww', 'owEEww', 'owEEww', 'owwwwE', '.owwww', '..owow', '..oooo'],
    { o: '#1a1a1a', w: '#f0ece0', E: '#1a1a1a' }, true);
}

// ------------------------------------------------------------------ ground + decor
export const GROUND = {};
export const DECOR = {};
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function buildGround() {
  const T = 64; // art pixels per tile side (drawn at PX scale => 128 world units)
  const make = (base, specks, extra) => {
    const c = canvas(T * PX, T * PX);
    const x = c.getContext('2d');
    x.fillStyle = base;
    x.fillRect(0, 0, c.width, c.height);
    const r = rng(1234 + base.length);
    for (const [color, n] of specks) {
      x.fillStyle = color;
      for (let i = 0; i < n; i++) x.fillRect(((r() * T) | 0) * PX, ((r() * T) | 0) * PX, PX, PX);
    }
    if (extra) extra(x, r);
    return c;
  };
  GROUND.grass = make('#1f3822', [['#26442a', 420], ['#1a3020', 380], ['#2e5230', 140], ['#35603a', 40]], (x, r) => {
    x.fillStyle = '#2c5230';
    for (let i = 0; i < 26; i++) { const px = (r() * T) | 0, py = (r() * T) | 0; x.fillRect(px * PX, py * PX, PX, PX * 2); x.fillRect((px + 1) * PX, (py - 1) * PX, PX, PX * 2); }
  });
  GROUND.stone = make('#29262e', [['#2e2b33', 300], ['#24212a', 300], ['#34303a', 90]], (x) => {
    x.fillStyle = '#1c1a21';
    for (let row = 0; row < 4; row++) {
      x.fillRect(0, row * 16 * PX, T * PX, PX);
      const off = row % 2 ? 8 : 0;
      for (let col = 0; col < 4; col++) x.fillRect(((col * 16 + off) % T) * PX, row * 16 * PX, PX, 16 * PX);
    }
    x.fillStyle = '#39343f';
    for (let row = 0; row < 4; row++) x.fillRect(0, (row * 16 + 1) * PX, T * PX, PX);
  });
  GROUND.snow = make('#c9d6e3', [['#d6e2ee', 420], ['#bccbdb', 380], ['#e8f0f8', 120], ['#a8bace', 40]]);

  const D = (rows, pal, m = false) => makeSprite(rows, pal, m);
  DECOR.grass = [
    D(['.y.', 'yoy', '.y.', '.g.'], { y: '#f0e070', o: '#e08040', g: '#3a7a3a' }),
    D(['.p.', 'pwp', '.p.', '.g.'], { p: '#d070d0', w: '#ffffff', g: '#3a7a3a' }),
    D(['g.g.g', 'gg.gg', '.ggg.'], { g: '#3a6a38' }),
    D(['.oo.', 'oSso', 'oSSo', '.oo.'], { o: '#2a2a30', S: '#6a6a74', s: '#9a9aa4' }),
    D(['..rr..', '.rRrr.', 'rrrrrr', '..ww..', '..ww..'], { r: '#b03030', R: '#ffffff', w: '#e8e0d0' }),
    D(['g..g', '.gg.', 'g.g.'], { g: '#2e5a30' }),
  ];
  DECOR.stone = [
    D(['.ww.', 'wEEw', 'wwww', '.ww.'], { w: '#d8d0c0', E: '#2a2420' }),
    D(['w....w', '.wwww.', 'w....w'], { w: '#c8c0b0' }),
    D(['.f.', 'fyf', '.w.', '.w.', 'ooo'], { f: '#ffa030', y: '#fff0a0', w: '#e8e0d0', o: '#4a4040' }),
    D(['o..', '.o.', '.oo', 'o..'], { o: '#1a181e' }),
    D(['.gg.', 'gggg', '.gg.'], { g: '#2a3a2a' }),
  ];
  DECOR.snow = [
    D(['.oo.', 'oiIo', 'oiio', '.oo.'], { o: '#6a88a8', i: '#b8e0f8', I: '#ffffff' }),
    D(['b...b', '.b.b.', '..b..', '..b..'], { b: '#5a4a3a' }),
    D(['.w.', 'www', '.w.'], { w: '#ffffff' }),
    D(['..ii..', '.iIIi.', 'iiiiii'], { i: '#a8d0f0', I: '#ffffff' }),
  ];
}

// ------------------------------------------------------------------ damage-number digits
export const DIGITS = { white: [], gold: [], red: [], green: [] };
export function buildDigits() {
  const colors = { white: '#ffffff', gold: '#ffd84a', red: '#ff5060', green: '#70ff90' };
  for (const [k, col] of Object.entries(colors)) {
    DIGITS[k] = [];
    for (let d = 0; d < 10; d++) {
      const c = canvas(14, 18);
      const x = c.getContext('2d');
      x.font = '700 16px "Pixelify Sans", monospace';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.lineWidth = 4;
      x.strokeStyle = '#000000';
      x.strokeText(String(d), 7, 10);
      x.fillStyle = col;
      x.fillText(String(d), 7, 10);
      DIGITS[k].push(c);
    }
  }
}

export function initSprites() {
  for (const t of ENEMY_LIST) ENEMY_SPR.push(buildEnemy(t));
  buildChars();
  buildPickups();
  buildProjectiles();
  buildIcons();
  buildGround();
  buildDigits();
}

// Render an icon into a DOM-ready data URL (cached)
const iconUrlCache = {};
export function iconUrl(id, scale = 3) {
  const key = id + '@' + scale;
  if (iconUrlCache[key]) return iconUrlCache[key];
  const src = ICONS[id];
  if (!src) return '';
  const c = canvas(16 * scale, 16 * scale);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  const s = Math.min(16 / src.width, 16 / src.height, 1.34) * scale;
  const w = src.width * s, h = src.height * s;
  x.drawImage(src, Math.round((c.width - w) / 2), Math.round((c.height - h) / 2), w, h);
  return (iconUrlCache[key] = c.toDataURL());
}

export function portraitUrl(charId, scale = 4) {
  const key = 'char:' + charId + '@' + scale;
  if (iconUrlCache[key]) return iconUrlCache[key];
  const src = CHAR_SPR[charId][0].r;
  const c = canvas(src.width * scale, src.height * scale);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(src, 0, 0, c.width, c.height);
  return (iconUrlCache[key] = c.toDataURL());
}

export function isWeapon(id) { return !!WEAPONS[id]; }
export function isPassive(id) { return !!PASSIVES[id]; }
