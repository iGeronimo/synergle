/** Normalized data for one TFT set, produced by scripts/update-set-data.ts. */

export interface ChampionStats {
  hp: number;
  armor: number;
  magicResist: number;
  damage: number;
  attackSpeed: number;
  range: number;
  mana: number;
  initialMana: number;
}

export interface ChampionData {
  /** URL-safe slug, e.g. "khazix". */
  id: string;
  apiName: string;
  name: string;
  cost: number;
  traits: string[];
  ability: {
    name: string;
    /** Ability text with markup removed and numbers replaced by "X". */
    text: string;
  };
  stats: ChampionStats;
  /** Site-relative image URL. */
  img: string;
}

export interface TraitBreakpoint {
  units: number;
  text: string;
}

export interface TraitData {
  id: string;
  apiName: string;
  name: string;
  text: string;
  breakpoints: TraitBreakpoint[];
  /** Champion ids. */
  members: string[];
  /** Site-relative icon URL, if downloaded. */
  icon?: string;
}

/** An augment that hands out specific champions ("Gain a Leona, a Kayle..."). */
export interface AugmentGrant {
  name: string;
  apiName: string;
  text: string;
  /** Champion ids. */
  champions: string[];
}

export interface SetData {
  set: number;
  name: string;
  source: string;
  fetchedAt: string;
  champions: ChampionData[];
  traits: TraitData[];
  augmentGrants: AugmentGrant[];
}
