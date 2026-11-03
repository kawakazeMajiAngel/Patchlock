import type {
  BalanceAssessment,
  Change,
  ChangeGroup,
  ChangeType,
  EntityType,
  NumericChange,
  Patch,
  PatchOverride,
  SourceLine,
} from "../types/patch";
import { PATCH_SECTIONS } from "../types/patch";

const entityTypes: EntityType[] = ["world", "hero", "item", "skill", "system"];
const changeTypes: ChangeType[] = [
  "value_increased",
  "value_decreased",
  "added",
  "removed",
  "behavior_changed",
  "bug_fix",
  "visual_change",
  "other",
];
const assessments: BalanceAssessment[] = ["buff", "nerf", "adjust", "unrated"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function hasValue<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || isString(value);
}

function isDateTime(value: unknown): value is string {
  return isString(value) && !Number.isNaN(Date.parse(value));
}

function isOptionalSourceUrl(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isString(value)) return false;

  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function isNumericValue(value: unknown): value is number | string {
  return typeof value === "number" || isString(value);
}

function isNumericChange(value: unknown): value is NumericChange {
  return (
    isRecord(value) &&
    isString(value.attribute) &&
    (value.before === undefined || isNumericValue(value.before)) &&
    (value.after === undefined || isNumericValue(value.after)) &&
    isOptionalString(value.unit)
  );
}

function isSourceLine(value: unknown): value is SourceLine {
  return (
    isRecord(value) &&
    isString(value.id) &&
    hasValue(PATCH_SECTIONS, value.section) &&
    isString(value.text)
  );
}

function isChange(value: unknown): value is Change {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isOptionalString(value.targetName) &&
    isString(value.description) &&
    hasValue(changeTypes, value.changeType) &&
    (value.numericChanges === undefined ||
      (Array.isArray(value.numericChanges) &&
        value.numericChanges.every(isNumericChange))) &&
    hasValue(assessments, value.balanceAssessment) &&
    Array.isArray(value.sourceLineIds) &&
    value.sourceLineIds.every(isString)
  );
}

function isChangeGroup(value: unknown): value is ChangeGroup {
  return (
    isRecord(value) &&
    isString(value.id) &&
    hasValue(PATCH_SECTIONS, value.section) &&
    hasValue(entityTypes, value.entityType) &&
    isString(value.entityId) &&
    isString(value.entityName) &&
    isOptionalString(value.gameMode) &&
    hasValue(assessments, value.balanceAssessment) &&
    Array.isArray(value.changes) &&
    value.changes.every(isChange)
  );
}

function hasUniqueIds(values: readonly { id: string }[]): boolean {
  return new Set(values.map(({ id }) => id)).size === values.length;
}

function isChangeOverride(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.balanceAssessment === undefined ||
      hasValue(assessments, value.balanceAssessment)) &&
    (value.description === undefined || isString(value.description))
  );
}

function isChangeGroupOverride(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.balanceAssessment === undefined ||
      hasValue(assessments, value.balanceAssessment)) &&
    (value.changes === undefined ||
      (isRecord(value.changes) &&
        Object.values(value.changes).every(isChangeOverride)))
  );
}

export function isPatchOverride(value: unknown): value is PatchOverride {
  return (
    isRecord(value) &&
    isString(value.patchId) &&
    value.patchId.length > 0 &&
    (value.originalUrl === undefined ||
      value.originalUrl === null ||
      isOptionalSourceUrl(value.originalUrl)) &&
    (value.changeGroups === undefined ||
      (isRecord(value.changeGroups) &&
        Object.values(value.changeGroups).every(isChangeGroupOverride)))
  );
}

export function isPatch(value: unknown): value is Patch {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isString(value.id) ||
    value.game !== "deadlock" ||
    !isString(value.title) ||
    !(value.publishedAt === undefined || isDateTime(value.publishedAt)) ||
    !isOptionalSourceUrl(value.URL) ||
    !isDateTime(value.importedAt) ||
    !Array.isArray(value.sourceLines) ||
    !value.sourceLines.every(isSourceLine) ||
    !Array.isArray(value.changeGroups) ||
    !value.changeGroups.every(isChangeGroup)
  ) {
    return false;
  }

  const sourceLineIds = new Set(
    (value.sourceLines as SourceLine[]).map(({ id }) => id),
  );
  const groups = value.changeGroups as ChangeGroup[];
  const changes = groups.flatMap(({ changes: groupChanges }) => groupChanges);

  return (
    hasUniqueIds(value.sourceLines as SourceLine[]) &&
    hasUniqueIds(groups) &&
    hasUniqueIds(changes) &&
    changes.every((change) =>
      change.sourceLineIds.every((sourceLineId) =>
        sourceLineIds.has(sourceLineId),
      ),
    )
  );
}

export function parsePatch(value: unknown, source: string): Patch {
  if (!isPatch(value)) {
    throw new Error(`${source}: Patch data does not conform to schema version 1.`);
  }
  return value;
}
