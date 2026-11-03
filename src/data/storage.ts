import { isPatchOverride, parsePatch } from "./validation";
import type { Patch, PatchOverride } from "../types/patch";

const DATABASE_NAME = "deadlock-patch-archive";
const DATABASE_VERSION = 1;
const USER_PATCHES_STORE = "userPatches";
const OVERRIDES_STORE = "overrides";
const LEGACY_PATCH_TITLE = "Gameplay Update";

export type ImportConflictPolicy = "keep-existing" | "replace-existing";

export type StoredData = {
  userPatches: Patch[];
  overrides: PatchOverride[];
};

export type ImportResult = {
  importedPatches: number;
  importedOverrides: number;
  skippedPatches: number;
  skippedOverrides: number;
};

function isLegacyImportedPatch(
  value: unknown,
): value is { id: string; title: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "id" in value &&
    typeof value.id === "string" &&
    "title" in value &&
    value.title === LEGACY_PATCH_TITLE
  );
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this browser."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let blocked = false;

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(USER_PATCHES_STORE)) {
        database.createObjectStore(USER_PATCHES_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(OVERRIDES_STORE)) {
        database.createObjectStore(OVERRIDES_STORE, { keyPath: "patchId" });
      }
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Unable to open IndexedDB."));
    };
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Another tab is using the database. Close it and try again."));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) {
        database.close();
        return;
      }
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

function readStoredData(database: IDBDatabase): Promise<StoredData> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      [USER_PATCHES_STORE, OVERRIDES_STORE],
      "readwrite",
    );
    const patchStore = transaction.objectStore(USER_PATCHES_STORE);
    const overrideStore = transaction.objectStore(OVERRIDES_STORE);
    const patchRequest = patchStore.getAll();
    const overrideRequest = overrideStore.getAll();
    let userPatches: unknown[] | undefined;
    let overrides: unknown[] | undefined;

    patchRequest.onsuccess = () => {
      userPatches = patchRequest.result;
      for (const patch of userPatches) {
        if (isLegacyImportedPatch(patch)) {
          patchStore.delete(patch.id);
          overrideStore.delete(patch.id);
        }
      }
      userPatches = userPatches.filter(
        (patch) => !isLegacyImportedPatch(patch),
      );
    };
    overrideRequest.onsuccess = () => {
      overrides = overrideRequest.result;
    };
    transaction.oncomplete = () => {
      try {
        if (!userPatches || !overrides) {
          throw new Error("Unable to load saved data.");
        }
        resolve({
          userPatches: userPatches.map((patch, index) =>
            parsePatch(patch, `IndexedDB userPatches[${index}]`),
          ),
          overrides: overrides.map((override, index) => {
            if (!isPatchOverride(override)) {
              throw new Error(`Invalid format for IndexedDB overrides[${index}].`);
            }
            return override;
          }),
        });
      } catch (error) {
        reject(error);
      }
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("Unable to load saved data."));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("Loading saved data was interrupted."));
    };
  });
}

export async function loadStoredData(): Promise<StoredData> {
  const database = await openDatabase();
  try {
    return await readStoredData(database);
  } finally {
    database.close();
  }
}

export async function saveUserPatch(patch: Patch): Promise<void> {
  const validatedPatch = parsePatch(patch, "User patch");
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(USER_PATCHES_STORE, "readwrite");
      transaction.objectStore(USER_PATCHES_STORE).put(validatedPatch);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        reject(transaction.error ?? new Error("Unable to save patch."));
      };
      transaction.onabort = () => {
        reject(transaction.error ?? new Error("Saving the patch was interrupted."));
      };
    });
  } finally {
    database.close();
  }
}

export async function deleteUserPatch(patchId: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        [USER_PATCHES_STORE, OVERRIDES_STORE],
        "readwrite",
      );
      transaction.objectStore(USER_PATCHES_STORE).delete(patchId);
      transaction.objectStore(OVERRIDES_STORE).delete(patchId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        reject(transaction.error ?? new Error("Unable to delete patch."));
      };
      transaction.onabort = () => {
        reject(transaction.error ?? new Error("Deleting the patch was interrupted."));
      };
    });
  } finally {
    database.close();
  }
}

export async function savePatchOverride(
  override: PatchOverride,
): Promise<void> {
  if (!isPatchOverride(override)) {
    throw new Error("Invalid override format.");
  }
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OVERRIDES_STORE, "readwrite");
      transaction.objectStore(OVERRIDES_STORE).put(override);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        reject(transaction.error ?? new Error("Unable to save override."));
      };
      transaction.onabort = () => {
        reject(transaction.error ?? new Error("Saving the override was interrupted."));
      };
    });
  } finally {
    database.close();
  }
}

export async function deletePatchOverride(patchId: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OVERRIDES_STORE, "readwrite");
      transaction.objectStore(OVERRIDES_STORE).delete(patchId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        reject(transaction.error ?? new Error("Unable to delete override."));
      };
      transaction.onabort = () => {
        reject(transaction.error ?? new Error("Deleting the override was interrupted."));
      };
    });
  } finally {
    database.close();
  }
}

export async function importStoredData(
  patches: Patch[],
  overrides: PatchOverride[],
  standardPatchIds: ReadonlySet<string>,
  policy: ImportConflictPolicy,
): Promise<ImportResult> {
  const database = await openDatabase();
  try {
    return await new Promise<ImportResult>((resolve, reject) => {
      const transaction = database.transaction(
        [USER_PATCHES_STORE, OVERRIDES_STORE],
        "readwrite",
      );
      const patchStore = transaction.objectStore(USER_PATCHES_STORE);
      const overrideStore = transaction.objectStore(OVERRIDES_STORE);
      const patchRequest = patchStore.getAll();
      const overrideRequest = overrideStore.getAll();
      let existingPatches: Patch[] | undefined;
      let existingOverrides: PatchOverride[] | undefined;
      let result: ImportResult | undefined;

      const queueImport = () => {
        if (!existingPatches || !existingOverrides || result) return;

        const existingPatchIds = new Set(
          existingPatches.map(({ id }) => id),
        );
        const existingOverrideIds = new Set(
          existingOverrides.map(({ patchId }) => patchId),
        );
        result = {
          importedPatches: 0,
          importedOverrides: 0,
          skippedPatches: 0,
          skippedOverrides: 0,
        };

        for (const patch of patches) {
          const protectedId = standardPatchIds.has(patch.id);
          const conflict = existingPatchIds.has(patch.id);
          if (protectedId || (conflict && policy === "keep-existing")) {
            result.skippedPatches += 1;
          } else {
            patchStore.put(patch);
            result.importedPatches += 1;
          }
        }

        for (const override of overrides) {
          const conflict = existingOverrideIds.has(override.patchId);
          if (conflict && policy === "keep-existing") {
            result.skippedOverrides += 1;
          } else {
            overrideStore.put(override);
            result.importedOverrides += 1;
          }
        }
      };
      patchRequest.onsuccess = () => {
        try {
          existingPatches = patchRequest.result.map((patch, index) =>
            parsePatch(patch, `IndexedDB userPatches[${index}]`),
          );
          queueImport();
        } catch (error) {
          reject(error);
          transaction.abort();
        }
      };
      overrideRequest.onsuccess = () => {
        try {
          existingOverrides = overrideRequest.result.map(
            (override: unknown, index: number) => {
              if (!isPatchOverride(override)) {
                throw new Error(
                  `Invalid format for IndexedDB overrides[${index}].`,
                );
              }
              return override;
            },
          );
          queueImport();
        } catch (error) {
          reject(error);
          transaction.abort();
        }
      };
      transaction.oncomplete = () => {
        if (!result) {
          reject(new Error("Unable to complete the import."));
          return;
        }
        resolve(result);
      };
      transaction.onerror = () => {
        reject(transaction.error ?? new Error("Unable to import data."));
      };
      transaction.onabort = () => {
        reject(transaction.error ?? new Error("Importing data was interrupted."));
      };
    });
  } finally {
    database.close();
  }
}
