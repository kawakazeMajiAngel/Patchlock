import type { PatchSection } from "../types/patch";

type AttributeEntry = {
  name: string;
  section: PatchSection;
  aliases?: string[];
};

const attributeEntries: AttributeEntry[] = [
  ...[
    "Abrams",
    "Apollo",
    "Baba",
    "Billy",
    "Calico",
    "Celeste",
    "Deadman Danny",
    "Doorman",
    "Drifter",
    "Graves",
    "Grey Talon",
    "Haze",
    "Infernus",
    "Kelvin",
    "Lady Geist",
    "Lash",
    "McGinnis",
    "Mirage",
    "Mo & Krill",
    "Nurse Harrow",
    "Nurse",
    "Paige",
    "Paradox",
    "Rat King",
    "Sinclair",
    "Seven",
    "Shiv",
    "Silver",
    "Solomon",
    "Venator",
    "Victor",
    "Violet",
    "Viscous",
    "Warden",
    "Wraith",
    "Yamato",
  ].map((name): AttributeEntry => ({ name, section: "heroes" })),
  ...[
    "Armor Piercer",
    "Battle Vest",
    "Bullet Lifesteal",
    "Bullet Resilience",
    "Crippling Headshot",
    "Decay",
    "Divine Barrier",
    "Echo Shard",
    "Express Shot",
    "Focus Lens",
    "Fury Trance",
    "Glass Cannon",
    "Golden Goose Egg",
    "Healbane",
    "Healing Booster",
    "Healing Nova",
    "High-Velocity Rounds",
    "Hunter's Aura",
    "Infuser",
    "Juggernaut",
    "Leech",
    "Lightning Scroll",
    "Metal Skin",
    "Mystic Slow",
    "Point Blank",
    "Radiant Regeneration",
    "Rebuttal",
    "Return Fire",
    "Shadow Weave",
    "Silence Wave",
    "Spellbreaker",
    "Spirit Lifesteal",
    "Spirit Sap",
    "Spirit Shielding",
    "Spiritual Overflow",
    "Torment Pulse",
    "Toxic Bullets",
    "Vampiric Burst",
  ].map((name): AttributeEntry => ({ name, section: "items" })),
  ...[
    "Mid-Boss",
    "Breakables",
    "Haunts",
    "Haunted Souls",
    "Comeback Gold",
    "Healing Snacks",
    "Steam Vents",
    "Move Slow",
    "Move Speed in Tunnels",
    "Haunts - Past Dues",
  ].map((name): AttributeEntry => ({ name, section: "general" })),
  {
    name: "Walker",
    section: "general",
    aliases: ["Fixed some bugs with Walker stomp logic"],
  },
  {
    name: "Hero Unlocking",
    section: "general",
    aliases: ["Latest 6 heroes"],
  },
  {
    name: "Street Brawl",
    section: "street_brawl",
  },
];

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const searchableEntries = attributeEntries
  .flatMap((entry) =>
    [entry.name, ...(entry.aliases ?? [])].map((name) => ({
      ...entry,
      searchableName: normalizeName(name),
    })),
  )
  .sort((left, right) => right.searchableName.length - left.searchableName.length);

export function findPatchAttribute(
  value: string,
  matchPrefix = false,
): { name: string; section: PatchSection } | undefined {
  const normalizedValue = normalizeName(value);
  const match = searchableEntries.find(
    ({ searchableName }) =>
      normalizedValue === searchableName ||
      (matchPrefix &&
        normalizedValue.startsWith(`${searchableName} `)),
  );
  return match
    ? { name: match.name, section: match.section }
    : undefined;
}
