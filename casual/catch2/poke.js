/** Type chart, damage, catch math, PokeAPI helpers for catch2. */

export const TYPE_KO = {
  normal: "노말", fire: "불꽃", water: "물", grass: "풀", electric: "전기", ice: "얼음",
  fighting: "격투", poison: "독", ground: "땅", flying: "비행", psychic: "에스퍼",
  bug: "벌레", rock: "바위", ghost: "고스트", dragon: "드래곤", dark: "악",
  steel: "강철", fairy: "페어리",
};

export const TYPE_COLOR = {
  normal: "#A8A878", fire: "#F08030", water: "#6890F0", grass: "#78C850", electric: "#F8D030",
  ice: "#98D8D8", fighting: "#C03028", poison: "#A040A0", ground: "#E0C068", flying: "#A890F0",
  psychic: "#F85888", bug: "#A8B820", rock: "#B8A038", ghost: "#705898", dragon: "#7038F8",
  dark: "#705848", steel: "#B8B8D0", fairy: "#EE99AC",
};

/** Attacker type -> defender type -> multiplier (Gen 6+ simplified). */
const CHART = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  grass: {
    fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2,
    dragon: 0.5, steel: 0.5,
  },
  electric: { water: 2, grass: 0.5, electric: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  ice: {
    fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5,
  },
  fighting: {
    normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0,
    dark: 2, steel: 2, fairy: 0.5,
  },
  poison: {
    grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2,
  },
  ground: {
    fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2,
  },
  flying: { grass: 2, electric: 0.5, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: {
    fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5,
    dark: 2, steel: 0.5, fairy: 0.5,
  },
  rock: {
    fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5,
  },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: {
    fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2,
  },
  fairy: {
    fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5,
  },
};

export function typeEffect(atkType, defTypes) {
  let m = 1;
  for (const d of defTypes) {
    const row = CHART[atkType] || {};
    m *= row[d] == null ? 1 : row[d];
  }
  return m;
}

export function effectivenessText(mult) {
  if (mult === 0) return "효과가 없는 듯하다…";
  if (mult >= 2) return "효과가 굉장했다!";
  if (mult <= 0.5) return "효과가 별로인 듯하다…";
  return "";
}

/** Official-ish damage with casual numbers. */
export function calcDamage({ level, power, atk, defense, stab, typeMult, rng = Math.random }) {
  if (typeMult === 0) return 0;
  const base = Math.floor(((2 * level) / 5 + 2) * power * (atk / Math.max(1, defense)) / 50) + 2;
  const mod = stab * typeMult * (0.85 + rng() * 0.15);
  return Math.max(1, Math.floor(base * mod));
}

export function catchChance({ maxHp, hp, catchRate, ballBonus = 1 }) {
  const a = Math.floor(((3 * maxHp - 2 * hp) * catchRate * ballBonus) / (3 * maxHp));
  const clamped = Math.max(1, Math.min(255, a));
  return clamped / 255;
}

export function combatPower(mon) {
  const bst = mon.bst || 300;
  const lv = mon.level || 5;
  return Math.round(bst * 0.35 + lv * 12);
}

export function cardEffectivePower(card, wildTypes, rng = Math.random) {
  const atkType = card.types[0];
  const mult = typeEffect(atkType, wildTypes);
  const raw = combatPower(card);
  // slight noise so equal cards aren't always ties
  return raw * (mult === 0 ? 0 : mult) * (0.97 + rng() * 0.06);
}

const POKE_API = "https://pokeapi.co/api/v2";
const POKE_CDN = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
export const POKE_ART = `${POKE_CDN}/other/official-artwork`;
export const POKE_FRONT = POKE_CDN;
export const POKE_BACK = `${POKE_CDN}/back`;

export const WILD_POOL = [
  10, 13, 16, 19, 21, 23, 25, 27, 29, 32, 35, 37, 39, 41, 43, 46, 48, 50, 52, 54,
  56, 58, 60, 63, 66, 69, 72, 74, 77, 79, 81, 83, 84, 86, 88, 90, 92, 96, 98, 100,
];

export const STARTERS = [
  { id: 1, ko: "이상해씨", type: "grass" },
  { id: 4, ko: "파이리", type: "fire" },
  { id: 7, ko: "꼬부기", type: "water" },
];

const cache = new Map();

export async function fetchSpecies(id) {
  const key = String(id);
  if (cache.has(key)) return cache.get(key);
  const [poke, species] = await Promise.all([
    fetch(`${POKE_API}/pokemon/${key}`).then((r) => r.json()),
    fetch(`${POKE_API}/pokemon-species/${key}`).then((r) => r.json()),
  ]);
  const koName = (species.names || []).find((n) => n.language.name === "ko")?.name
    || poke.name;
  const enName = poke.name;
  const types = poke.types.map((t) => t.type.name);
  const stats = Object.fromEntries(poke.stats.map((s) => [s.stat.name, s.base_stat]));
  const bst = poke.stats.reduce((a, s) => a + s.base_stat, 0);
  const catchRate = species.capture_rate ?? 45;
  const moves = pickMoves(poke.moves, types);
  const flavorKo = (species.flavor_text_entries || []).find((f) => f.language?.name === "ko");
  const flavorEn = (species.flavor_text_entries || []).find((f) => f.language?.name === "en");
  const flavor = (flavorKo?.flavor_text || flavorEn?.flavor_text || "")
    .replace(/[\f\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const info = {
    id: Number(key),
    ko: koName,
    en: enName,
    types,
    stats,
    bst,
    catchRate,
    moves,
    flavor,
    art: `${POKE_ART}/${key}.png`,
    front: `${POKE_FRONT}/${key}.png`,
    back: `${POKE_BACK}/${key}.png`,
  };
  cache.set(key, info);
  return info;
}

function pickMoves(moveEntries, types) {
  const primary = types[0] || "normal";
  const typed = [];
  const normal = [];
  for (const m of moveEntries) {
    const name = m.move.name;
    if (name.includes("-")) {
      // keep simple English move ids for display mapping
    }
    const group = m.version_group_details?.[0];
    if (!group || group.move_learn_method?.name !== "level-up") continue;
    const lv = group.level_learned_at || 0;
    if (lv > 20) continue;
    normal.push({ id: name, level: lv });
  }
  // Fallback curated moves by type
  const defaults = {
    fire: [
      { id: "ember", ko: "불꽃세례", type: "fire", power: 40 },
      { id: "scratch", ko: "할퀴기", type: "normal", power: 40 },
    ],
    water: [
      { id: "water-gun", ko: "물대포", type: "water", power: 40 },
      { id: "tackle", ko: "몸통박치기", type: "normal", power: 40 },
    ],
    grass: [
      { id: "vine-whip", ko: "덩굴채찍", type: "grass", power: 45 },
      { id: "tackle", ko: "몸통박치기", type: "normal", power: 40 },
    ],
    electric: [
      { id: "thunder-shock", ko: "전기쇼크", type: "electric", power: 40 },
      { id: "quick-attack", ko: "전광석화", type: "normal", power: 40 },
    ],
    normal: [
      { id: "tackle", ko: "몸통박치기", type: "normal", power: 40 },
      { id: "quick-attack", ko: "전광석화", type: "normal", power: 40 },
    ],
  };
  const base = defaults[primary] || defaults.normal;
  const second = defaults.normal[1];
  return [
    { ...base[0] },
    { ...(base[1] || second), type: base[1]?.type || "normal" },
  ];
}

export function makeBattler(info, level = 5, overrides = {}) {
  const hpStat = info.stats.hp || 45;
  const maxHp = Math.floor(((2 * hpStat) * level) / 100) + level + 10;
  return {
    id: info.id,
    ko: info.ko,
    en: info.en,
    types: info.types,
    level,
    maxHp,
    hp: maxHp,
    atk: info.stats.attack || 45,
    def: info.stats.defense || 45,
    spa: info.stats["special-attack"] || 45,
    spd: info.stats["special-defense"] || 45,
    spe: info.stats.speed || 45,
    bst: info.bst,
    catchRate: info.catchRate,
    moves: info.moves.map((m) => ({ ...m })),
    art: info.art,
    front: info.front,
    back: info.back,
    ...overrides,
  };
}

export function typeChipsHtml(types) {
  return types.map((t) =>
    `<span class="type-chip" style="background:${TYPE_COLOR[t] || "#888"}">${TYPE_KO[t] || t}</span>`
  ).join("");
}
