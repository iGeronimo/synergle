/**
 * Downloads the latest TFT data from Community Dragon, normalizes the current
 * set and saves champion portraits + trait icons as WebP.
 *
 *   npm run data:update                       # newest set, fetch from CDragon
 *   npm run data:update -- --set 18           # a specific set
 *   npm run data:update -- --file en_us.json  # use a local copy of the dump
 *   npm run data:update -- --name "Enchanted Wilds" --force-images
 */
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR, PUBLIC_DIR, parseArgs, setDir, writeJson } from "./lib/paths.ts";
import { cleanAbilityText, parseTraitText, slugify, type TraitEffectLike } from "./lib/text.ts";
import type { AugmentGrant, ChampionData, SetData, TraitData } from "./lib/set-types.ts";

const CDRAGON_JSON = "https://raw.communitydragon.org/latest/cdragon/tft/en_us.json";
const CDRAGON_GAME = "https://raw.communitydragon.org/latest/game/";

/** CDragon's set "name" field is unreliable, so known names live here. */
const KNOWN_SET_NAMES: Record<number, string> = {
  18: "Enchanted Wilds",
};

const PORTRAIT_SIZE = 192;
const TRAIT_ICON_SIZE = 64;

interface RawChampion {
  apiName: string;
  name: string;
  cost: number;
  traits?: string[];
  squareIcon?: string;
  tileIcon?: string;
  ability?: { name?: string; desc?: string };
  stats?: Record<string, number | null>;
}

interface RawTrait {
  apiName: string;
  name: string;
  desc?: string;
  icon?: string;
  effects?: TraitEffectLike[];
}

interface RawItem {
  apiName: string;
  name: string;
  desc?: string;
}

interface RawDump {
  items: RawItem[];
  setData: { mutator: string; number: number; name: string; champions: RawChampion[]; traits: RawTrait[]; augments: string[] }[];
}

const args = parseArgs(process.argv.slice(2));

async function fetchWithRetry(url: string, tries = 3): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      lastError = new Error(`${res.status} ${res.statusText} for ${url}`);
      if (res.status === 404) break;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 750 * (i + 1)));
  }
  throw lastError;
}

async function loadDump(): Promise<RawDump> {
  if (typeof args.file === "string") {
    console.log(`Reading ${args.file}`);
    return JSON.parse(fs.readFileSync(args.file, "utf8")) as RawDump;
  }
  console.log(`Downloading ${CDRAGON_JSON} (~25 MB)...`);
  const res = await fetchWithRetry(CDRAGON_JSON);
  const text = await res.text();
  fs.mkdirSync(path.join(CACHE_DIR, "cdragon"), { recursive: true });
  fs.writeFileSync(path.join(CACHE_DIR, "cdragon", "en_us.json"), text);
  return JSON.parse(text) as RawDump;
}

function cdragonUrl(assetPath: string): string {
  return CDRAGON_GAME + assetPath.toLowerCase().replace(/\.(tex|dds)$/, ".png");
}

type SharpFactory = (input: Buffer) => {
  resize: (w: number, h: number, opts?: object) => ReturnType<SharpFactory>;
  webp: (opts?: object) => ReturnType<SharpFactory>;
  toFile: (file: string) => Promise<unknown>;
};

async function loadSharp(): Promise<SharpFactory | null> {
  try {
    const mod = await import("sharp");
    return (mod.default ?? mod) as unknown as SharpFactory;
  } catch {
    console.warn("sharp is not available; images will be saved as PNG.");
    return null;
  }
}

async function saveImage(
  sharp: SharpFactory | null,
  url: string,
  outBase: string,
  size: number,
  fit: "cover" | "contain"
): Promise<string> {
  const ext = sharp ? ".webp" : ".png";
  const outFile = outBase + ext;
  if (fs.existsSync(outFile) && !args["force-images"]) return outFile;
  const res = await fetchWithRetry(url);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  if (sharp) {
    await sharp(buf)
      .resize(size, size, { fit, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: fit === "cover" ? 80 : 90 })
      .toFile(outFile);
  } else {
    fs.writeFileSync(outFile, buf);
  }
  return outFile;
}

async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!);
  });
  await Promise.all(workers);
}

function publicUrl(file: string): string {
  return "/" + path.relative(PUBLIC_DIR, file).split(path.sep).join("/");
}

function pickSet(dump: RawDump): RawDump["setData"][number] {
  const mainSets = dump.setData.filter((s) => /^TFTSet\d+$/.test(s.mutator));
  if (typeof args.set === "string") {
    const wanted = Number(args.set);
    const found = mainSets.find((s) => s.number === wanted);
    if (!found) throw new Error(`Set ${wanted} not found. Available: ${mainSets.map((s) => s.number).join(", ")}`);
    return found;
  }
  return mainSets.reduce((a, b) => (b.number > a.number ? b : a));
}

function parseAugmentGrants(
  rawSet: RawDump["setData"][number],
  items: Map<string, RawItem>,
  champions: ChampionData[]
): AugmentGrant[] {
  const byName = [...champions].sort((a, b) => b.name.length - a.name.length);
  const grants: AugmentGrant[] = [];
  for (const apiName of rawSet.augments) {
    const aug = items.get(apiName);
    if (!aug?.desc) continue;
    const text = aug.desc.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "");
    const sentences = text.split(/(?<=\.)\s+/).filter((s) => /^\s*Gain\b/.test(s));
    const ids = new Set<string>();
    for (const sentence of sentences) {
      for (const champ of byName) {
        const escaped = champ.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`(?<![\\w'])${escaped}(?![\\w'])`).test(sentence)) ids.add(champ.id);
      }
    }
    if (ids.size >= 2) {
      grants.push({ name: aug.name.trim(), apiName, text: cleanAbilityText(aug.desc), champions: [...ids] });
    }
  }
  return grants.sort((a, b) => a.name.localeCompare(b.name));
}

async function main(): Promise<void> {
  const dump = await loadDump();
  const rawSet = pickSet(dump);
  const setNumber = rawSet.number;
  const setName =
    typeof args.name === "string" ? args.name : KNOWN_SET_NAMES[setNumber] ?? `Set ${setNumber}`;
  console.log(`Set ${setNumber}: ${setName} (${rawSet.mutator})`);

  const sharp = args["skip-images"] ? null : await loadSharp();
  const items = new Map(dump.items.map((i) => [i.apiName, i]));

  // Playable champions: shop cost 1-5, at least one trait, not a "Name (Variant)" copy.
  const seen = new Set<string>();
  const rawChamps = rawSet.champions
    .filter((c) => c.cost >= 1 && c.cost <= 5 && (c.traits?.length ?? 0) > 0 && c.squareIcon)
    .filter((c) => !/\(.+\)\s*$/.test(c.name))
    .filter((c) => {
      if (seen.has(c.name)) {
        console.warn(`Skipping duplicate champion entry ${c.apiName} (${c.name})`);
        return false;
      }
      seen.add(c.name);
      return true;
    });

  const portraitDir = path.join(PUBLIC_DIR, "img", "champions", String(setNumber));
  const champions: ChampionData[] = [];
  for (const c of rawChamps) {
    const id = slugify(c.name);
    const stats = c.stats ?? {};
    champions.push({
      id,
      apiName: c.apiName,
      name: c.name.trim(),
      cost: c.cost,
      traits: [...(c.traits ?? [])],
      ability: { name: (c.ability?.name ?? "").trim(), text: cleanAbilityText(c.ability?.desc ?? "") },
      stats: {
        hp: Number(stats.hp ?? 0),
        armor: Number(stats.armor ?? 0),
        magicResist: Number(stats.magicResist ?? 0),
        damage: Number(stats.damage ?? 0),
        attackSpeed: Math.round(Number(stats.attackSpeed ?? 0) * 100) / 100,
        range: Number(stats.range ?? 0),
        mana: Number(stats.mana ?? 0),
        initialMana: Number(stats.initialMana ?? 0),
      },
      img: publicUrl(path.join(portraitDir, id + (sharp || args["skip-images"] ? ".webp" : ".png"))),
    });
  }
  champions.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));

  const traitIconDir = path.join(PUBLIC_DIR, "img", "traits", String(setNumber));
  const traits: TraitData[] = [];
  for (const t of rawSet.traits) {
    const members = champions.filter((c) => c.traits.includes(t.name)).map((c) => c.id);
    if (!members.length) continue;
    const { text, breakpoints } = parseTraitText(t.desc ?? "", t.effects ?? []);
    const id = slugify(t.name);
    traits.push({
      id,
      apiName: t.apiName,
      name: t.name,
      text,
      breakpoints,
      members,
      icon: t.icon ? publicUrl(path.join(traitIconDir, id + (sharp || args["skip-images"] ? ".webp" : ".png"))) : undefined,
    });
  }
  traits.sort((a, b) => a.name.localeCompare(b.name));

  const augmentGrants = parseAugmentGrants(rawSet, items, champions);

  if (!args["skip-images"]) {
    console.log(`Downloading ${champions.length} portraits and ${traits.length} trait icons...`);
    const champByApi = new Map(rawChamps.map((c) => [slugify(c.name), c]));
    let failures = 0;
    await runPool(champions, 6, async (champ) => {
      const raw = champByApi.get(champ.id)!;
      const out = path.join(portraitDir, champ.id);
      try {
        await saveImage(sharp, cdragonUrl(raw.squareIcon!), out, PORTRAIT_SIZE, "cover");
      } catch (err) {
        if (raw.tileIcon) {
          await saveImage(sharp, cdragonUrl(raw.tileIcon), out, PORTRAIT_SIZE, "cover");
        } else {
          failures++;
          console.error(`  ! portrait for ${champ.name}: ${(err as Error).message}`);
        }
      }
    });
    const rawTraitByName = new Map(rawSet.traits.map((t) => [t.name, t]));
    await runPool(traits, 6, async (trait) => {
      const raw = rawTraitByName.get(trait.name);
      if (!raw?.icon) return;
      try {
        await saveImage(sharp, cdragonUrl(raw.icon), path.join(traitIconDir, trait.id), TRAIT_ICON_SIZE, "contain");
      } catch (err) {
        trait.icon = undefined;
        console.warn(`  ! trait icon for ${trait.name}: ${(err as Error).message}`);
      }
    });
    if (failures) throw new Error(`${failures} portrait(s) failed to download.`);
  }

  const data: SetData = {
    set: setNumber,
    name: setName,
    source: "Community Dragon (raw.communitydragon.org)",
    fetchedAt: new Date().toISOString(),
    champions,
    traits,
    augmentGrants,
  };
  const outFile = path.join(setDir(setNumber), "set.json");
  writeJson(outFile, data);
  console.log(
    `Saved ${path.relative(process.cwd(), outFile)}: ${champions.length} champions, ` +
      `${traits.length} traits, ${augmentGrants.length} champion-granting augments.`
  );
  if (!fs.existsSync(path.join(setDir(setNumber), "curated.json"))) {
    console.log(
      `\nNo curated categories for set ${setNumber} yet. Copy data/sets/<old>/curated.json as a template, ` +
        `then run \`npm run categories:report\` to review the category pool.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
