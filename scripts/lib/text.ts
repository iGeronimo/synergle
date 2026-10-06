/** Helpers for turning Community Dragon markup into readable text. */

const STAT_LABELS: Record<string, string> = {
  scalead: "AD",
  scaleap: "AP",
  scalehealth: "Health",
  scalearmor: "Armor",
  scalemr: "Magic Resist",
  scaleas: "Attack Speed",
  scalemanaregen: "Mana Regen",
  scaledr: "Durability",
  scaleda: "Damage Amp",
  scalecrit: "Crit",
  scalesv: "Omnivamp",
  scalerange: "Range",
};

/** 32-bit FNV-1a of the lowercased name: how Riot hashes unknown bin field names. */
export function binHash(name: string): string {
  let h = 0x811c9dc5;
  for (const ch of name.toLowerCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeNewlines(raw: string): string {
  return raw
    .replace(/\\r|\r/g, "")
    .replace(/\\n|\n|<br\s*\/?>/gi, "\n");
}

function tidy(s: string): string {
  return s
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\( +/g, "(")
    .replace(/ +([.,:;)%])/g, "$1")
    .replace(/:(?=[A-Za-z])/g, ": ")
    .trim();
}

/**
 * Cleans an ability description. Champion abilities in the data have no
 * numeric variables, so every @Placeholder@ becomes "X".
 */
export function cleanAbilityText(raw: string): string {
  let s = normalizeNewlines(raw);
  // "Adaptor </Bright>%i:scaleAD%<Bright>:</Bright>" -> "Adaptor (AD):"
  s = s.replace(
    /Adaptor\s*(?:<\/?[a-z]+>\s*)*%i:scale(AD|AP)%\s*(?:<\/?[a-z]+>\s*)*:/gi,
    (_m, k: string) => `Adaptor (${k.toUpperCase()}):`
  );
  s = s.replace(/%i:[a-zA-Z]+%/g, "");
  s = s.replace(/\{[^}]*\}/g, "");
  s = s.replace(/@[^@\s]+@/g, "X");
  s = s.replace(/<[^>]+>/g, "");
  return tidy(s);
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "X";
  const rounded = Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
  return String(rounded);
}

/**
 * Resolves "@Name@" / "@Name*100@" placeholders against a variables map whose
 * keys are either plain names or "{binhash}" strings.
 */
export function resolvePlaceholders(
  s: string,
  vars: Record<string, number>,
  extra: Record<string, number> = {}
): string {
  const lookup = (name: string): number | undefined => {
    const lower = name.toLowerCase();
    if (lower in extra) return extra[lower];
    for (const [k, v] of Object.entries(vars)) {
      if (k.toLowerCase() === lower) return v;
    }
    const hashed = `{${binHash(name)}}`;
    return vars[hashed];
  };
  return s.replace(/@([A-Za-z0-9_.]+)(?:\*(\d+(?:\.\d+)?))?@/g, (_m, name: string, mult?: string) => {
    const v = lookup(name);
    if (v === undefined) return "X";
    return formatNumber(v * (mult ? Number(mult) : 1));
  });
}

function stripMarkup(s: string, keepStatLabels: boolean): string {
  let out = s.replace(/%i:([a-zA-Z]+)%/g, (_m, key: string) =>
    keepStatLabels ? ` ${STAT_LABELS[key.toLowerCase()] ?? ""} ` : ""
  );
  out = out.replace(/\{[^}]*\}/g, "");
  out = out.replace(/@[^@\s]+@/g, "X");
  out = out.replace(/<[^>]+>/g, "");
  return tidy(out);
}

export interface TraitEffectLike {
  minUnits: number;
  maxUnits?: number;
  variables?: Record<string, number> | null;
}

/** Splits a trait description into its main text and per-breakpoint lines. */
export function parseTraitText(
  raw: string,
  effects: TraitEffectLike[]
): { text: string; breakpoints: { units: number; text: string }[] } {
  const normalized = normalizeNewlines(raw);
  const sorted = [...effects].sort((a, b) => a.minUnits - b.minUnits);
  const firstVars = sorted[0]?.variables ?? {};
  const rowRe = /<row>([\s\S]*?)<\/row>/gi;
  const rows: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(normalized))) rows.push(m[1]);
  const firstRow = normalized.search(/<row>/i);
  const mainRaw = firstRow === -1 ? normalized : normalized.slice(0, firstRow);
  const text = stripMarkup(resolvePlaceholders(mainRaw, firstVars ?? {}), true);

  const breakpoints = sorted.map((eff, i) => {
    const rowRaw = rows[i] ?? "";
    const resolved = resolvePlaceholders(rowRaw, eff.variables ?? {}, {
      minunits: eff.minUnits,
    });
    // The game draws stat icons that aren't in the text, which can leave a dangling "OR".
    const rowText = stripMarkup(resolved, true)
      .replace(/^\(\d+\)\s*/, "")
      .replace(/\s+(OR|or|and|\|)\s*$/, "");
    return { units: eff.minUnits, text: rowText };
  });
  return { text, breakpoints };
}

/** Returns the sentence of `text` that contains the first match of `pattern`. */
export function sentenceMatching(text: string, pattern: RegExp, maxLength = 160): string | null {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const hit = sentences.find((s) => pattern.test(s));
  if (!hit) return null;
  return hit.length > maxLength ? hit.slice(0, maxLength - 1).trimEnd() + "…" : hit;
}
