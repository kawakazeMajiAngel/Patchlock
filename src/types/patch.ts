export const PATCH_SECTIONS = [
  "general",
  "items",
  "heroes",
  "street_brawl",
  "another",
] as const;

export type PatchSection = (typeof PATCH_SECTIONS)[number];

export type EntityType = "world" | "hero" | "item" | "skill" | "system";

export type ChangeType =
  | "value_increased"
  | "value_decreased"
  | "added"
  | "removed"
  | "behavior_changed"
  | "bug_fix"
  | "visual_change"
  | "other";

export type BalanceAssessment = "buff" | "nerf" | "adjust" | "unrated";

export type NumericChange = {
  attribute: string;
  before?: number | string;
  after?: number | string;
  unit?: string;
};

export type Change = {
  id: string;
  targetName?: string;
  description: string;
  changeType: ChangeType;
  numericChanges?: NumericChange[];
  balanceAssessment: BalanceAssessment;
  sourceLineIds: string[];
};

export type ChangeGroup = {
  id: string;
  section: PatchSection;
  entityType: EntityType;
  entityId: string;
  entityName: string;
  gameMode?: string;
  balanceAssessment: BalanceAssessment;
  changes: Change[];
};

export type SourceLine = {
  id: string;
  section: PatchSection;
  text: string;
};

export type Patch = {
  schemaVersion: 1;
  id: string;
  game: "deadlock";
  title: string;
  publishedAt?: string;
  URL?: string;
  importedAt: string;
  sourceLines: SourceLine[];
  changeGroups: ChangeGroup[];
};

export type ChangeOverride = {
  balanceAssessment?: BalanceAssessment;
  description?: string;
};

export type ChangeGroupOverride = {
  balanceAssessment?: BalanceAssessment;
  changes?: Record<string, ChangeOverride>;
};

export type PatchOverride = {
  patchId: string;
  changeGroups?: Record<string, ChangeGroupOverride>;
};
