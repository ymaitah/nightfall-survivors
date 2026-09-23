// Shared game data: used by both the server simulation and the browser client.

export const TICK_RATE = 30;          // server simulation steps per second
export const SNAP_EVERY = 2;          // send a snapshot every N ticks (15 Hz)
export const VIEW_W = 1100;           // maximum visible world width  (client zoom guarantees <=)
export const VIEW_H = 620;            // maximum visible world height
export const CULL_X = 760;            // snapshot culling half-extents around a player
export const CULL_Y = 500;
export const SPAWN_PAD = 70;          // enemies spawn this far outside the max view box
export const DESPAWN_DIST = 1250;     // enemies farther than this from every player get recycled
export const MAX_PLAYERS = 6;
export const MAX_WEAPONS = 6;
export const MAX_PASSIVES = 6;
export const PLAYER_R = 11;
export const BASE_SPEED = 135;        // px / s
export const BASE_MAGNET = 55;        // pickup radius px
export const REVIVE_R = 64;
export const REVIVE_TIME = 3;         // seconds of standing next to a downed friend
export const MAX_GEMS = 450;

export const SLOT_COLORS = ['#5ec8ff', '#ff8a5c', '#9be15d', '#ff6fb5', '#ffd84a', '#b98cff'];

export const BASE_STATS = {
  maxHp: 100, maxHpMult: 0, recovery: 0, armor: 0, moveSpeed: 1, might: 1, area: 1, speed: 1,
  duration: 1, amount: 0, cooldown: 1, luck: 1, growth: 1, greed: 1, magnet: 1, revival: 0, reroll: 0,
};

export const STAT_LABELS = {
  maxHp: 'Max Health', recovery: 'Recovery', armor: 'Armor', moveSpeed: 'Move Speed', might: 'Might',
  area: 'Area', speed: 'Speed', duration: 'Duration', amount: 'Amount', cooldown: 'Cooldown',
  luck: 'Luck', growth: 'Growth', greed: 'Greed', magnet: 'Magnet', revival: 'Revival',
};

// ---------------------------------------------------------------------------------------------
// Characters
// look: head style + palette for the procedural humanoid sprite
export const CHARACTERS = [
  { id: 'varek', name: 'Varek', title: 'Monster Hunter', weapon: 'whip', bonus: '+10% Might, +20 Max Health',
    stats: { might: 0.1, maxHp: 20 },
    look: { head: 'hair', h: '#5a3a22', H: '#3a2414', c: '#9a2a36', C: '#621a24', a: '#e0b040', p: '#3a2a3a', b: '#2a1a14' } },
  { id: 'lysa', name: 'Lysa', title: 'Apprentice Mage', weapon: 'wand', bonus: '-8% Cooldown, +10% Growth',
    stats: { cooldown: -0.08, growth: 0.1 },
    look: { head: 'wizard', h: '#5040b0', H: '#302478', c: '#6a58c8', C: '#40329a', a: '#f0d870', p: '#302478', b: '#1e1840' } },
  { id: 'nyx', name: 'Nyx', title: 'Shadow Rogue', weapon: 'knife', bonus: '+15% Move Speed, +10% Speed',
    stats: { moveSpeed: 0.15, speed: 0.1 },
    look: { head: 'hood', h: '#34344a', H: '#20202e', c: '#404058', C: '#2a2a3c', a: '#8ad8f0', p: '#2a2a3c', b: '#16161f' } },
  { id: 'brom', name: 'Brom', title: 'Woodsman', weapon: 'axe', bonus: '+30 Max Health, +1 Armor',
    stats: { maxHp: 30, armor: 1 },
    look: { head: 'hair', h: '#c0502a', H: '#803018', c: '#4f7a3a', C: '#335226', a: '#9a7440', p: '#4a3a2a', b: '#2a1a10' } },
  { id: 'kestrel', name: 'Kestrel', title: 'Wandering Knight', weapon: 'boomerang', bonus: '+25% Luck',
    stats: { luck: 0.25 },
    look: { head: 'helm', h: '#b8c4d0', H: '#6a7888', c: '#3a6ab0', C: '#244a80', a: '#f0d060', p: '#2a3448', b: '#3a3a44' } },
  { id: 'aldo', name: 'Brother Aldo', title: 'Wandering Monk', weapon: 'orbit', bonus: '+10% Area, +10% Duration',
    stats: { area: 0.1, duration: 0.1 },
    look: { head: 'hood', h: '#7a5430', H: '#523418', c: '#8a6038', C: '#5e3e20', a: '#e0c878', p: '#5e3e20', b: '#3a2410' } },
  { id: 'ignis', name: 'Ignis', title: 'Pyromancer', weapon: 'firewand', bonus: '+20% Might, -5% Move Speed',
    stats: { might: 0.2, moveSpeed: -0.05 },
    look: { head: 'wizard', h: '#b8321c', H: '#782010', c: '#d0501e', C: '#983410', a: '#ffc040', p: '#5a1a10', b: '#301008' } },
  { id: 'garrick', name: 'Old Garrick', title: 'Herbalist', weapon: 'garlic', bonus: '+0.4 HP/s Recovery, +30% Magnet',
    stats: { recovery: 0.4, magnet: 0.3 },
    look: { head: 'hair', h: '#c8c8c8', H: '#8a8a8a', c: '#6e7048', C: '#4a4c2e', a: '#e8e0b0', p: '#4a3c2a', b: '#2a2016' } },
  { id: 'seraphine', name: 'Seraphine', title: 'Cleric', weapon: 'water', bonus: '+15% Duration, +10 Max Health',
    stats: { duration: 0.15, maxHp: 10 },
    look: { head: 'hood', h: '#eceef8', H: '#aab0cc', c: '#dde2f4', C: '#a0a8c8', a: '#5aa8f0', p: '#8890b0', b: '#5a6080' } },
  { id: 'mira', name: 'Mira', title: 'Stormcaller', weapon: 'lightning', bonus: '+10% Area, +10% Might',
    stats: { area: 0.1, might: 0.1 },
    look: { head: 'hair', h: '#30c8b8', H: '#1a8478', c: '#2c4c78', C: '#1c3254', a: '#f4e44a', p: '#1c3254', b: '#121e34' } },
  { id: 'pix', name: 'Pix', title: 'Runesmith', weapon: 'rune', bonus: '+20% Speed, +10% Duration',
    stats: { speed: 0.2, duration: 0.1 },
    look: { head: 'hair', h: '#f070b0', H: '#b04080', c: '#6a44b0', C: '#4a2c80', a: '#70f0e0', p: '#3a2460', b: '#221438' } },
];
export const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map(c => [c.id, c]));

// ---------------------------------------------------------------------------------------------
// Passive items
export const PASSIVES = {
  whetstone:  { name: 'Whetstone',       stat: 'might',     per: 0.10, max: 5, desc: 'Sharpens everything. +10% damage.' },
  plate:      { name: 'Plate Armor',     stat: 'armor',     per: 1,    max: 5, desc: 'Reduces incoming damage by 1.' },
  heart:      { name: 'Heart Vessel',    stat: 'maxHpMult', per: 0.20, max: 5, desc: '+20% max health.' },
  herb:       { name: 'Vital Herb',      stat: 'recovery',  per: 0.20, max: 5, desc: 'Recover 0.2 health per second.' },
  tome:       { name: 'Quickening Tome', stat: 'cooldown',  per: -0.08, max: 5, desc: 'Weapons recharge 8% faster.' },
  candelabra: { name: 'Candelabra',      stat: 'area',      per: 0.10, max: 5, desc: '+10% attack area.' },
  bracer:     { name: 'Bracer',          stat: 'speed',     per: 0.10, max: 5, desc: '+10% projectile speed.' },
  hourglass:  { name: 'Hourglass',       stat: 'duration',  per: 0.10, max: 5, desc: 'Effects last 10% longer.' },
  mirror:     { name: 'Mirror Shard',    stat: 'amount',    per: 1,    max: 2, desc: 'Fire 1 extra projectile.' },
  boots:      { name: 'Winged Boots',    stat: 'moveSpeed', per: 0.10, max: 5, desc: '+10% movement speed.' },
  lodestone:  { name: 'Lodestone',       stat: 'magnet',    per: 0.40, max: 5, desc: '+40% pickup range.' },
  clover:     { name: 'Clover',          stat: 'luck',      per: 0.10, max: 5, desc: '+10% luck.' },
  crown:      { name: 'Scholar Crown',   stat: 'growth',    per: 0.08, max: 5, desc: '+8% experience gained.' },
};

// ---------------------------------------------------------------------------------------------
// Weapons. `base` holds level-1 stats, `levels[i]` is the delta applied when reaching level i+1.
// damage (per hit), cooldown (s), area (mult), speed (mult), amount, pierce, duration (s),
// interval (s between projectiles of a burst), knock (knockback mult)
const L = (...a) => a;
export const WEAPONS = {
  whip: {
    name: 'Whip', kind: 'whip', desc: 'Lashes horizontally, cutting through enemies.',
    base: { damage: 10, cooldown: 1.35, area: 1, speed: 1, amount: 1, pierce: 0, duration: 0, interval: 0.12, knock: 1 },
    levels: L({}, { amount: 1 }, { damage: 5 }, { area: 0.1, damage: 5 }, { damage: 5 }, { area: 0.1, damage: 5 }, { damage: 5 }, { damage: 5 }),
    evolve: { with: 'heart', into: 'crimson' },
  },
  wand: {
    name: 'Magic Wand', kind: 'wand', desc: 'Fires a bolt at the nearest enemy.',
    base: { damage: 10, cooldown: 1.2, area: 1, speed: 1, amount: 1, pierce: 1, duration: 0, interval: 0.1, knock: 1 },
    levels: L({}, { amount: 1 }, { cooldown: -0.2 }, { amount: 1 }, { damage: 10 }, { amount: 1 }, { pierce: 1 }, { damage: 10 }),
    evolve: { with: 'tome', into: 'torrent' },
  },
  knife: {
    name: 'Knife', kind: 'knife', desc: 'Thrown in the direction you face. Fast.',
    base: { damage: 7, cooldown: 1.0, area: 1, speed: 1, amount: 1, pierce: 1, duration: 0, interval: 0.08, knock: 0.6 },
    levels: L({}, { amount: 1, damage: 5 }, { amount: 1 }, { pierce: 1 }, { amount: 1 }, { amount: 1, damage: 5 }, { amount: 1 }, { pierce: 1 }),
    evolve: { with: 'bracer', into: 'blades' },
  },
  axe: {
    name: 'Axe', kind: 'axe', desc: 'Hurled high into the air. High damage.',
    base: { damage: 20, cooldown: 4, area: 1, speed: 1, amount: 1, pierce: 3, duration: 0, interval: 0.15, knock: 1 },
    levels: L({}, { amount: 1 }, { damage: 20 }, { pierce: 2 }, { amount: 1 }, { damage: 20 }, { pierce: 2 }, { damage: 20 }),
    evolve: { with: 'candelabra', into: 'spiral' },
  },
  boomerang: {
    name: 'Holy Cross', kind: 'boomerang', desc: 'Flies toward the nearest enemy, then returns.',
    base: { damage: 8, cooldown: 2, area: 1, speed: 1, amount: 1, pierce: 999, duration: 0, interval: 0.12, knock: 1 },
    levels: L({}, { damage: 10 }, { area: 0.1, speed: 0.25 }, { amount: 1 }, { damage: 10 }, { area: 0.1, speed: 0.25 }, { amount: 1 }, { damage: 10 }),
    evolve: { with: 'clover', into: 'heaven' },
  },
  orbit: {
    name: 'Holy Tome', kind: 'orbit', desc: 'Tomes orbit around you, battering foes.',
    base: { damage: 10, cooldown: 3, area: 1, speed: 1, amount: 1, pierce: 999, duration: 3, interval: 0, knock: 1 },
    levels: L({}, { amount: 1 }, { speed: 0.3, area: 0.25 }, { damage: 10, duration: 0.5 }, { amount: 1 }, { speed: 0.3, area: 0.25 }, { damage: 10, duration: 0.5 }, { amount: 1 }),
    evolve: { with: 'hourglass', into: 'eternal' },
  },
  firewand: {
    name: 'Fire Wand', kind: 'fireball', desc: 'Hurls fireballs at a random enemy.',
    base: { damage: 20, cooldown: 3, area: 1, speed: 1, amount: 3, pierce: 1, duration: 0, interval: 0, knock: 1.2 },
    levels: L({}, { damage: 10 }, { damage: 10, speed: 0.2 }, { damage: 10 }, { damage: 10, speed: 0.2 }, { damage: 10 }, { damage: 10, speed: 0.2 }, { damage: 10 }),
    evolve: { with: 'whetstone', into: 'inferno' },
  },
  garlic: {
    name: 'Garlic', kind: 'aura', desc: 'Damages and repels nearby enemies.',
    base: { damage: 5, cooldown: 1.3, area: 1, speed: 1, amount: 0, pierce: 999, duration: 0, interval: 0, knock: 0.5 },
    levels: L({}, { area: 0.4, damage: 2 }, { cooldown: -0.1, damage: 1 }, { area: 0.2, damage: 1 }, { cooldown: -0.1, damage: 2 }, { area: 0.2, damage: 1 }, { cooldown: -0.1, damage: 1 }, { area: 0.2, damage: 1 }),
    evolve: { with: 'herb', into: 'siphon' },
  },
  water: {
    name: 'Holy Water', kind: 'water', desc: 'Leaves burning pools of holy water.',
    base: { damage: 10, cooldown: 4.5, area: 1, speed: 1, amount: 1, pierce: 999, duration: 2, interval: 0.3, knock: 0 },
    levels: L({}, { amount: 1, area: 0.2 }, { damage: 10, duration: 0.5 }, { amount: 1, area: 0.2 }, { damage: 10, duration: 0.3 }, { amount: 1, area: 0.2 }, { damage: 5, duration: 0.3 }, { damage: 5, area: 0.2 }),
    evolve: { with: 'lodestone', into: 'flood' },
  },
  lightning: {
    name: 'Lightning Ring', kind: 'lightning', desc: 'Strikes random enemies with lightning.',
    base: { damage: 15, cooldown: 4.5, area: 1, speed: 1, amount: 2, pierce: 999, duration: 0, interval: 0, knock: 0 },
    levels: L({}, { amount: 1 }, { area: 0.25, damage: 10 }, { amount: 1 }, { area: 0.25, damage: 20 }, { amount: 1 }, { area: 0.25, damage: 20 }, { amount: 1 }),
    evolve: { with: 'mirror', into: 'thunder' },
  },
  rune: {
    name: 'Rune Tracer', kind: 'rune', desc: 'A rune that ricochets around the screen.',
    base: { damage: 10, cooldown: 3, area: 1, speed: 1, amount: 1, pierce: 999, duration: 2.25, interval: 0.25, knock: 0.8 },
    levels: L({}, { damage: 5, speed: 0.2 }, { damage: 5, duration: 0.3 }, { amount: 1 }, { damage: 5, speed: 0.2 }, { damage: 5, duration: 0.3 }, { amount: 1 }, { duration: 0.5 }),
    evolve: { with: 'plate', into: 'singularity' },
  },

  // ----- Evolutions -----
  crimson: {
    name: 'Crimson Lash', kind: 'whip', evolved: true, from: 'whip', desc: 'Critical hits. Heals you for every enemy struck.',
    base: { damage: 30, cooldown: 1.15, area: 1.35, speed: 1, amount: 2, pierce: 0, duration: 0, interval: 0.1, knock: 1.2, crit: 0.25, lifesteal: 0.6 },
    levels: L({}),
  },
  torrent: {
    name: 'Arcane Torrent', kind: 'wand', evolved: true, from: 'wand', desc: 'An unending stream of arcane bolts.',
    base: { damage: 22, cooldown: 0.14, area: 1.2, speed: 1.2, amount: 1, pierce: 2, duration: 0, interval: 0.04, knock: 0.8 },
    levels: L({}),
  },
  blades: {
    name: 'Thousand Blades', kind: 'knife', evolved: true, from: 'knife', desc: 'A ceaseless storm of blades.',
    base: { damage: 16, cooldown: 0.12, area: 1.1, speed: 1.3, amount: 1, pierce: 3, duration: 0, interval: 0.03, knock: 0.5 },
    levels: L({}),
  },
  spiral: {
    name: "Reaper's Spiral", kind: 'spiral', evolved: true, from: 'axe', desc: 'Spiraling axes pass through everything.',
    base: { damage: 55, cooldown: 3, area: 1.8, speed: 1, amount: 8, pierce: 999, duration: 2.4, interval: 0, knock: 1.2 },
    levels: L({}),
  },
  heaven: {
    name: "Heaven's Edge", kind: 'boomerang', evolved: true, from: 'boomerang', desc: 'Radiant blades that can critically strike.',
    base: { damage: 32, cooldown: 1.3, area: 1.4, speed: 1.25, amount: 3, pierce: 999, duration: 0, interval: 0.1, knock: 1.2, crit: 0.3 },
    levels: L({}),
  },
  eternal: {
    name: 'Eternal Tome', kind: 'orbit', evolved: true, from: 'orbit', desc: 'Tomes orbit forever and hit harder.',
    base: { damage: 32, cooldown: 3, area: 1.55, speed: 1.6, amount: 4, pierce: 999, duration: 9999, interval: 0, knock: 1.4 },
    levels: L({}),
  },
  inferno: {
    name: 'Inferno', kind: 'fireball', evolved: true, from: 'firewand', desc: 'Colossal fireballs that burn through hordes.',
    base: { damage: 90, cooldown: 2.6, area: 2.3, speed: 0.85, amount: 3, pierce: 999, duration: 0, interval: 0, knock: 1.5 },
    levels: L({}),
  },
  siphon: {
    name: 'Soul Siphon', kind: 'aura', evolved: true, from: 'garlic', desc: 'A vast aura that drains life from enemies.',
    base: { damage: 16, cooldown: 0.8, area: 2.3, speed: 1, amount: 0, pierce: 999, duration: 0, interval: 0, knock: 0.7, lifesteal: 0.25 },
    levels: L({}),
  },
  flood: {
    name: 'Blessed Flood', kind: 'water', evolved: true, from: 'water', desc: 'Swelling pools that chase down enemies.',
    base: { damage: 22, cooldown: 3.5, area: 1.7, speed: 1, amount: 4, pierce: 999, duration: 4, interval: 0.25, knock: 0, grow: true },
    levels: L({}),
  },
  thunder: {
    name: 'Thunder Crown', kind: 'lightning', evolved: true, from: 'lightning', desc: 'Every strike lands twice.',
    base: { damage: 50, cooldown: 3.5, area: 1.7, speed: 1, amount: 6, pierce: 999, duration: 0, interval: 0, knock: 0, double: true },
    levels: L({}),
  },
  singularity: {
    name: 'Singularity', kind: 'rune', evolved: true, from: 'rune', desc: 'Runes explode every time they ricochet.',
    base: { damage: 30, cooldown: 2.5, area: 1.35, speed: 1.3, amount: 3, pierce: 999, duration: 3.5, interval: 0.2, knock: 1, explode: true },
    levels: L({}),
  },
};
export const BASE_WEAPONS = Object.keys(WEAPONS).filter(k => !WEAPONS[k].evolved);

export function weaponMaxLevel(id) { return WEAPONS[id].levels.length; }

// Cumulative stats of a weapon at a given level
export function weaponStats(id, level) {
  const w = WEAPONS[id];
  const s = { ...w.base };
  for (let i = 1; i < level && i < w.levels.length; i++) {
    for (const [k, v] of Object.entries(w.levels[i])) s[k] = (s[k] || 0) + v;
  }
  return s;
}

const fmt = (v) => (Math.round(v * 100) / 100).toString();
export function describeDelta(d) {
  const parts = [];
  for (const [k, v] of Object.entries(d)) {
    if (k === 'damage') parts.push(`+${fmt(v)} damage`);
    else if (k === 'cooldown') parts.push(`${fmt(v)}s cooldown`);
    else if (k === 'area') parts.push(`+${Math.round(v * 100)}% area`);
    else if (k === 'speed') parts.push(`+${Math.round(v * 100)}% speed`);
    else if (k === 'amount') parts.push(`+${v} projectile${v > 1 ? 's' : ''}`);
    else if (k === 'pierce') parts.push(`pierces ${v} more`);
    else if (k === 'duration') parts.push(`+${fmt(v)}s duration`);
  }
  return parts.join(', ');
}

export function describeUpgrade(type, id, level) {
  if (type === 'weapon') {
    const w = WEAPONS[id];
    if (level <= 1) return w.desc;
    const t = describeDelta(w.levels[level - 1] || {});
    return t.charAt(0).toUpperCase() + t.slice(1) + '.';
  }
  if (type === 'passive') return PASSIVES[id].desc;
  if (type === 'gold') return 'Take 25 gold instead.';
  if (type === 'heal') return 'Restore 30 health.';
  return '';
}

// Evolution lookup: base weapon -> { passive, into }
export const EVOLUTIONS = Object.fromEntries(
  BASE_WEAPONS.filter(k => WEAPONS[k].evolve).map(k => [k, WEAPONS[k].evolve])
);

// ---------------------------------------------------------------------------------------------
// Enemies
// hp, speed px/s, dmg (contact), xp, r (hit radius), kb (knockback taken), sprite + optional palette variant
export const ENEMIES = {
  bat:        { hp: 3,    speed: 92,  dmg: 3,  xp: 1,  r: 9,  kb: 1.2, sprite: 'bat', move: 'flutter' },
  zombie:     { hp: 10,   speed: 44,  dmg: 6,  xp: 1,  r: 11, kb: 1.0, sprite: 'zombie' },
  skeleton:   { hp: 12,   speed: 58,  dmg: 7, xp: 2,  r: 11, kb: 0.9, sprite: 'skeleton' },
  ghost:      { hp: 8,   speed: 100, dmg: 5,  xp: 1,  r: 10, kb: 1.3, sprite: 'ghost', move: 'float' },
  slime:      { hp: 25,   speed: 40,  dmg: 9, xp: 2,  r: 12, kb: 0.8, sprite: 'slime' },
  eye:        { hp: 20,   speed: 100, dmg: 8, xp: 2,  r: 10, kb: 1.0, sprite: 'eye', move: 'wave' },
  werewolf:   { hp: 80,  speed: 78,  dmg: 13, xp: 4,  r: 14, kb: 0.6, sprite: 'werewolf', scale: 1.25 },
  mummy:      { hp: 110,  speed: 48,  dmg: 16, xp: 4,  r: 13, kb: 0.5, sprite: 'mummy', scale: 1.15 },
  knight:     { hp: 250,  speed: 54,  dmg: 22, xp: 6, r: 14, kb: 0.3, sprite: 'knight', scale: 1.25 },
  wraith:     { hp: 160,  speed: 92,  dmg: 20, xp: 5,  r: 12, kb: 0.6, sprite: 'wraith', move: 'float', scale: 1.15 },
  mudman:     { hp: 40,   speed: 36,  dmg: 11, xp: 3,  r: 13, kb: 0.6, sprite: 'mudman', scale: 1.15 },
  icebat:     { hp: 6,    speed: 104, dmg: 4,  xp: 1,  r: 9,  kb: 1.2, sprite: 'icebat', move: 'flutter' },
  frostslime: { hp: 35,   speed: 44,  dmg: 10, xp: 3,  r: 12, kb: 0.8, sprite: 'frostslime' },
  yeti:       { hp: 120,  speed: 70,  dmg: 18, xp: 5,  r: 16, kb: 0.4, sprite: 'yeti', scale: 1.45 },
  icewraith:  { hp: 160,  speed: 96,  dmg: 21, xp: 5,  r: 12, kb: 0.6, sprite: 'icewraith', move: 'float', scale: 1.15 },
  // bosses (always drop a chest)
  batlord:    { hp: 2600, speed: 72,  dmg: 30, xp: 60, r: 30, kb: 0.05, sprite: 'batlord', move: 'flutter', scale: 3.2, boss: true },
  colossus:   { hp: 9000, speed: 46,  dmg: 42, xp: 150, r: 34, kb: 0.02, sprite: 'colossus', scale: 3.6, boss: true },
  nightlord:  { hp: 22000, speed: 64, dmg: 55, xp: 300, r: 32, kb: 0.01, sprite: 'nightlord', move: 'float', scale: 3.4, boss: true },
  frostgiant: { hp: 9500, speed: 44,  dmg: 44, xp: 150, r: 36, kb: 0.02, sprite: 'frostgiant', scale: 3.6, boss: true },
  // destructible light source that drops floor items
  brazier:    { hp: 1,    speed: 0,   dmg: 0,  xp: 0,  r: 12, kb: 0, sprite: 'brazier', prop: true },
};
export const ENEMY_LIST = Object.keys(ENEMIES);
export const ENEMY_ID = Object.fromEntries(ENEMY_LIST.map((k, i) => [k, i]));

// ---------------------------------------------------------------------------------------------
// Stages. Each wave entry covers one "timeline minute" (runs of any length are mapped onto 30).
// [enemy types, minimum alive (solo), spawn interval, extras]
const W = (types, min, every, extra = {}) => ({ types, min, every, ...extra });
export const STAGES = [
  {
    id: 'forest', name: 'Moonlit Forest', desc: 'The classic. A quiet glade where the dead refuse to rest.', ground: 'grass',
    waves: [
      W(['bat'], 10, 1.2),
      W(['bat', 'zombie'], 22, 1.0),
      W(['zombie', 'bat'], 32, 1.0, { event: 'swarm' }),
      W(['skeleton', 'zombie'], 38, 1.0, { elite: 'zombie' }),
      W(['skeleton', 'bat', 'ghost'], 48, 0.9),
      W(['ghost', 'slime'], 56, 0.9, { event: 'ring' }),
      W(['slime', 'skeleton'], 64, 0.9, { elite: 'werewolf' }),
      W(['werewolf', 'bat'], 60, 0.9),
      W(['eye', 'zombie'], 85, 0.8, { event: 'swarm' }),
      W(['werewolf', 'ghost'], 80, 0.8),
      W(['bat', 'skeleton'], 95, 0.8, { boss: 'batlord' }),
      W(['mummy', 'skeleton'], 90, 0.8),
      W(['slime', 'eye'], 115, 0.7, { event: 'ring' }),
      W(['werewolf', 'mummy'], 105, 0.7, { elite: 'mummy' }),
      W(['ghost', 'eye'], 140, 0.6, { event: 'swarm' }),
      W(['knight', 'zombie'], 120, 0.7, { elite: 'knight' }),
      W(['wraith', 'bat'], 145, 0.6),
      W(['mummy', 'eye'], 155, 0.6, { event: 'ring' }),
      W(['knight', 'werewolf'], 150, 0.6),
      W(['wraith', 'ghost'], 175, 0.5, { event: 'swarm' }),
      W(['knight', 'skeleton'], 150, 0.6, { boss: 'colossus' }),
      W(['werewolf', 'wraith'], 195, 0.5),
      W(['mummy', 'knight'], 200, 0.5, { event: 'swarm' }),
      W(['eye', 'wraith'], 235, 0.5, { elite: 'wraith' }),
      W(['knight', 'wraith'], 220, 0.5, { event: 'ring' }),
      W(['werewolf', 'mummy', 'knight'], 255, 0.45, { elite: 'knight' }),
      W(['wraith', 'eye'], 275, 0.45, { event: 'swarm' }),
      W(['knight', 'wraith', 'mummy'], 290, 0.4, { boss: 'nightlord' }),
      W(['werewolf', 'knight', 'wraith', 'eye'], 310, 0.4, { event: 'ring' }),
      W(['knight', 'wraith', 'mummy', 'werewolf'], 340, 0.35, { elite: 'wraith', event: 'swarm' }),
    ],
  },
  {
    id: 'crypt', name: 'Bone Crypt', desc: 'Ancient halls packed with restless bones.', ground: 'stone',
    waves: [
      W(['skeleton'], 10, 1.2),
      W(['skeleton', 'bat'], 22, 1.0),
      W(['ghost', 'skeleton'], 32, 1.0, { event: 'ring' }),
      W(['skeleton', 'mudman'], 38, 1.0, { elite: 'skeleton' }),
      W(['ghost', 'bat'], 50, 0.9, { event: 'swarm' }),
      W(['mudman', 'skeleton'], 56, 0.9),
      W(['mummy', 'ghost'], 60, 0.9, { elite: 'mummy' }),
      W(['eye', 'skeleton'], 75, 0.8, { event: 'ring' }),
      W(['mummy', 'bat'], 80, 0.8),
      W(['wraith', 'ghost'], 85, 0.8, { event: 'swarm' }),
      W(['skeleton', 'mudman'], 95, 0.8, { boss: 'colossus' }),
      W(['knight', 'ghost'], 95, 0.8),
      W(['mummy', 'eye'], 115, 0.7, { event: 'ring' }),
      W(['wraith', 'skeleton'], 110, 0.7, { elite: 'knight' }),
      W(['ghost', 'eye'], 140, 0.6, { event: 'swarm' }),
      W(['knight', 'mummy'], 125, 0.7),
      W(['wraith', 'mudman'], 145, 0.6, { elite: 'wraith' }),
      W(['knight', 'eye'], 160, 0.6, { event: 'ring' }),
      W(['mummy', 'wraith'], 165, 0.6),
      W(['knight', 'ghost'], 180, 0.5, { event: 'swarm' }),
      W(['wraith', 'skeleton'], 160, 0.6, { boss: 'batlord' }),
      W(['knight', 'mummy'], 195, 0.5),
      W(['wraith', 'eye'], 210, 0.5, { event: 'ring' }),
      W(['knight', 'wraith'], 230, 0.5, { elite: 'knight' }),
      W(['mummy', 'knight', 'eye'], 240, 0.5, { event: 'swarm' }),
      W(['wraith', 'knight'], 260, 0.45),
      W(['knight', 'wraith', 'mummy'], 280, 0.45, { event: 'ring' }),
      W(['wraith', 'knight', 'eye'], 295, 0.4, { boss: 'nightlord' }),
      W(['knight', 'wraith', 'mummy', 'eye'], 315, 0.4, { event: 'swarm' }),
      W(['knight', 'wraith', 'mummy', 'mudman'], 345, 0.35, { elite: 'wraith', event: 'ring' }),
    ],
  },
  {
    id: 'tundra', name: 'Frostbite Hollow', desc: 'The hardest stage. A frozen waste where the cold itself hunts you.', ground: 'snow',
    waves: [
      W(['icebat'], 10, 1.2),
      W(['icebat', 'zombie'], 22, 1.0),
      W(['frostslime', 'icebat'], 30, 1.0, { event: 'swarm' }),
      W(['zombie', 'frostslime'], 38, 1.0, { elite: 'frostslime' }),
      W(['ghost', 'icebat'], 48, 0.9, { event: 'ring' }),
      W(['frostslime', 'skeleton'], 56, 0.9),
      W(['yeti', 'icebat'], 55, 0.9, { elite: 'yeti' }),
      W(['ghost', 'frostslime'], 75, 0.8, { event: 'swarm' }),
      W(['yeti', 'skeleton'], 75, 0.8),
      W(['yeti', 'icebat'], 85, 0.8, { event: 'ring' }),
      W(['frostslime', 'yeti'], 95, 0.8, { boss: 'frostgiant' }),
      W(['ghost', 'eye'], 100, 0.8),
      W(['yeti', 'eye'], 115, 0.7, { event: 'swarm' }),
      W(['icewraith', 'frostslime'], 115, 0.7, { elite: 'icewraith' }),
      W(['knight', 'icebat'], 130, 0.6, { event: 'ring' }),
      W(['yeti', 'icewraith'], 130, 0.7),
      W(['knight', 'frostslime'], 145, 0.6, { elite: 'yeti' }),
      W(['icewraith', 'eye'], 160, 0.6, { event: 'swarm' }),
      W(['yeti', 'knight'], 160, 0.6),
      W(['icewraith', 'ghost'], 180, 0.5, { event: 'ring' }),
      W(['yeti', 'knight'], 165, 0.6, { boss: 'batlord' }),
      W(['icewraith', 'frostslime'], 200, 0.5),
      W(['knight', 'yeti'], 210, 0.5, { event: 'swarm' }),
      W(['icewraith', 'eye'], 235, 0.5, { elite: 'knight' }),
      W(['yeti', 'icewraith'], 240, 0.5, { event: 'ring' }),
      W(['knight', 'yeti', 'icewraith'], 260, 0.45),
      W(['icewraith', 'eye', 'yeti'], 280, 0.45, { event: 'swarm' }),
      W(['knight', 'icewraith', 'yeti'], 295, 0.4, { boss: 'frostgiant' }),
      W(['yeti', 'knight', 'icewraith', 'eye'], 315, 0.4, { event: 'ring' }),
      W(['knight', 'icewraith', 'yeti', 'frostslime'], 345, 0.35, { elite: 'icewraith', event: 'swarm' }),
    ],
  },
];
export const STAGE_BY_ID = Object.fromEntries(STAGES.map(s => [s.id, s]));
export const RUN_LENGTHS = [10, 15, 20, 30]; // minutes

// ---------------------------------------------------------------------------------------------
// Projectile / pickup / event ids used by the binary protocol
export const PROJ_KINDS = ['bolt', 'knife', 'axe', 'cross', 'book', 'fireball', 'flask', 'pool', 'rune',
  'spiral', 'torrent', 'blade', 'heaven', 'ebook', 'inferno', 'fpool', 'srune', 'fflask'];
export const PROJ_ID = Object.fromEntries(PROJ_KINDS.map((k, i) => [k, i]));

export const PICKUP_KINDS = ['gem1', 'gem2', 'gem3', 'coin', 'bag', 'chicken', 'magnet', 'relic', 'clock', 'chest'];
export const PICKUP_ID = Object.fromEntries(PICKUP_KINDS.map((k, i) => [k, i]));

export const EV = {
  DMG: 1, DEATH: 2, HURT: 3, WHIP: 4, LIGHTNING: 5, EXPLODE: 6, PICKUP: 7, RELIC: 8,
  CHEST: 9, REVIVE: 10, HEAL: 11, DOWN: 12, BRAZIER: 13, LEVELUP: 14,
};

// ---------------------------------------------------------------------------------------------
// Permanent power-ups bought with gold between runs (stored client-side)
export const POWERUPS = {
  might:    { name: 'Might',     stat: 'might',     per: 0.05, max: 5, cost: 200,  desc: '+5% damage per rank.' },
  armor:    { name: 'Armor',     stat: 'armor',     per: 1,    max: 3, cost: 600,  desc: '+1 armor per rank.' },
  maxhp:    { name: 'Max Health', stat: 'maxHpMult', per: 0.1, max: 3, cost: 200,  desc: '+10% max health per rank.' },
  recovery: { name: 'Recovery',  stat: 'recovery',  per: 0.1,  max: 5, cost: 200,  desc: '+0.1 HP/s per rank.' },
  cooldown: { name: 'Cooldown',  stat: 'cooldown',  per: -0.025, max: 2, cost: 900, desc: '-2.5% cooldown per rank.' },
  area:     { name: 'Area',      stat: 'area',      per: 0.05, max: 2, cost: 300,  desc: '+5% area per rank.' },
  speed:    { name: 'Speed',     stat: 'speed',     per: 0.1,  max: 2, cost: 300,  desc: '+10% projectile speed per rank.' },
  duration: { name: 'Duration',  stat: 'duration',  per: 0.15, max: 2, cost: 300,  desc: '+15% duration per rank.' },
  amount:   { name: 'Amount',    stat: 'amount',    per: 1,    max: 1, cost: 5000, desc: '+1 projectile.' },
  move:     { name: 'Move Speed', stat: 'moveSpeed', per: 0.05, max: 2, cost: 300, desc: '+5% move speed per rank.' },
  magnet:   { name: 'Magnet',    stat: 'magnet',    per: 0.25, max: 2, cost: 300,  desc: '+25% pickup range per rank.' },
  luck:     { name: 'Luck',      stat: 'luck',      per: 0.1,  max: 3, cost: 600,  desc: '+10% luck per rank.' },
  growth:   { name: 'Growth',    stat: 'growth',    per: 0.03, max: 5, cost: 900,  desc: '+3% experience per rank.' },
  greed:    { name: 'Greed',     stat: 'greed',     per: 0.1,  max: 5, cost: 200,  desc: '+10% gold per rank.' },
  revival:  { name: 'Revival',   stat: 'revival',   per: 1,    max: 1, cost: 10000, desc: 'Revive once per run on death.' },
  reroll:   { name: 'Reroll',    stat: 'reroll',    per: 1,    max: 3, cost: 1000, desc: '+1 level-up reroll per run.' },
};
export function powerupCost(id, rank) { return POWERUPS[id].cost * (rank + 1); }

// Compute a player's full stat block
export function computeStats(charId, passives, powerups) {
  const s = { ...BASE_STATS };
  const c = CHAR_BY_ID[charId] || CHARACTERS[0];
  for (const [k, v] of Object.entries(c.stats)) s[k] += v;
  if (powerups) {
    for (const [id, rank] of Object.entries(powerups)) {
      const pu = POWERUPS[id];
      if (!pu) continue;
      const r = Math.max(0, Math.min(pu.max, rank | 0));
      s[pu.stat] += pu.per * r;
    }
  }
  for (const [id, lvl] of passives) {
    const p = PASSIVES[id];
    s[p.stat] += p.per * lvl;
  }
  s.maxHp = Math.round(s.maxHp * (1 + s.maxHpMult));
  s.cooldown = Math.max(0.4, s.cooldown);
  return s;
}

// Experience needed to go from `level` to `level + 1` (solo; scaled by player count on the server)
export function xpForLevel(level) {
  if (level < 20) return 5 + (level - 1) * 10;
  if (level < 40) return 195 + (level - 20) * 13;
  if (level < 60) return 455 + (level - 40) * 20;
  return 855 + (level - 60) * 30;
}
