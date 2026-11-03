import { isPatchOverride, parsePatch } from "./validation";
import type { Patch, PatchOverride } from "../types/patch";
import type { StoredData } from "./storage";

export type PatchArchiveBackup = {
  schemaVersion: 1;
  exportedAt: string;
  standardPatches: Patch[];
  userPatches: Patch[];
  overrides: PatchOverride[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureUniquePatchIds(patches: readonly Patch[], label: string): void {
  if (new Set(patches.map(({ id }) => id)).size !== patches.length) {
    throw new Error(`${label}に重複したパッチIDがあります。`);
  }
}

function ensureUniqueOverrideIds(
  overrides: readonly PatchOverride[],
  label: string,
): void {
  if (new Set(overrides.map(({ patchId }) => patchId)).size !== overrides.length) {
    throw new Error(`${label}に重複したOverrideがあります。`);
  }
}

export function createBackup(
  standardPatches: Patch[],
  storedData: StoredData,
): PatchArchiveBackup {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    standardPatches,
    userPatches: storedData.userPatches,
    overrides: storedData.overrides,
  };
}

export function parseBackup(value: unknown): PatchArchiveBackup {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.exportedAt !== "string" ||
    Number.isNaN(Date.parse(value.exportedAt)) ||
    !Array.isArray(value.standardPatches) ||
    !Array.isArray(value.userPatches) ||
    !Array.isArray(value.overrides)
  ) {
    throw new Error("バックアップの形式またはschemaVersionが不正です。");
  }

  const standardPatches = value.standardPatches.map((patch, index) =>
    parsePatch(patch, `standardPatches[${index}]`),
  );
  const userPatches = value.userPatches.map((patch, index) =>
    parsePatch(patch, `userPatches[${index}]`),
  );
  const overrides = value.overrides.map((override, index) => {
    if (!isPatchOverride(override)) {
      throw new Error(`overrides[${index}]の形式が不正です。`);
    }
    return override;
  });

  ensureUniquePatchIds(standardPatches, "standardPatches");
  ensureUniquePatchIds(userPatches, "userPatches");
  ensureUniqueOverrideIds(overrides, "overrides");

  return {
    schemaVersion: 1,
    exportedAt: value.exportedAt,
    standardPatches,
    userPatches,
    overrides,
  };
}

export function summarizeImportConflicts(
  backup: PatchArchiveBackup,
  existing: StoredData,
  standardPatchIds: ReadonlySet<string>,
) {
  const existingUserPatchIds = new Set(
    existing.userPatches.map(({ id }) => id),
  );
  const existingOverrideIds = new Set(
    existing.overrides.map(({ patchId }) => patchId),
  );
  const protectedPatchIds = backup.userPatches
    .filter(({ id }) => standardPatchIds.has(id))
    .map(({ id }) => id);

  return {
    protectedPatchIds,
    conflictingPatchIds: backup.userPatches
      .filter(
        ({ id }) =>
          existingUserPatchIds.has(id) && !standardPatchIds.has(id),
      )
      .map(({ id }) => id),
    conflictingOverrideIds: backup.overrides
      .filter(({ patchId }) => existingOverrideIds.has(patchId))
      .map(({ patchId }) => patchId),
  };
}
