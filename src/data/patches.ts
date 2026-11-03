import type { Patch, PatchOverride } from "../types/patch";
import { isPatch, parsePatch } from "./validation";

type PatchIndex = {
  schemaVersion: 1;
  patchFiles: string[];
};

function isPatchIndex(value: unknown): value is PatchIndex {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === 1 &&
    Array.isArray(record.patchFiles) &&
    record.patchFiles.every(
      (file) =>
        typeof file === "string" &&
        /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/.test(file),
    ) &&
    new Set(record.patchFiles).size === record.patchFiles.length
  );
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(
      `Unable to load standard data (${response.status}: ${path})`,
    );
  }
  return response.json() as Promise<unknown>;
}

export async function loadStandardPatches(): Promise<Patch[]> {
  const indexValue = await fetchJson("data/patches/index.json");
  if (!isPatchIndex(indexValue)) {
    throw new Error("Invalid format in data/patches/index.json.");
  }

  const patches = await Promise.all(
    indexValue.patchFiles.map(async (file) =>
      parsePatch(
        await fetchJson(`data/patches/${file}`),
        `data/patches/${file}`,
      ),
    ),
  );

  if (patches.some((patch) => !isPatch(patch))) {
    throw new Error("Standard patch data validation failed.");
  }
  if (new Set(patches.map(({ id }) => id)).size !== patches.length) {
    throw new Error("Standard patch data contains duplicate IDs.");
  }

  return patches.sort((left, right) => {
    const leftDate = left.publishedAt ?? left.importedAt;
    const rightDate = right.publishedAt ?? right.importedAt;
    return rightDate.localeCompare(leftDate);
  });
}

export function applyPatchOverrides(
  patches: Patch[],
  overrides: PatchOverride[],
): Patch[] {
  const overridesByPatchId = new Map(
    overrides.map((override) => [override.patchId, override]),
  );

  return patches.map((patch) => {
    const originalUrl = overridesByPatchId.get(patch.id)?.originalUrl;
    if (originalUrl === undefined) return patch;

    const updatedPatch = { ...patch };
    if (originalUrl === null) {
      delete updatedPatch.URL;
    } else {
      updatedPatch.URL = originalUrl;
    }
    return updatedPatch;
  });
}
