import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { applyPatchOverrides, loadStandardPatches } from "./data/patches";
import { loadStoredData, savePatchOverride } from "./data/storage";
import BalanceAssessmentEditor from "./BalanceAssessmentEditor";
import type { Patch, PatchOverride } from "./types/patch";

function mergePatchCollections(...sets: Patch[][]): Patch[] {
  return [...sets.flat()].sort((left, right) => {
    const leftDate = left.publishedAt ?? left.importedAt;
    const rightDate = right.publishedAt ?? right.importedAt;
    return rightDate.localeCompare(leftDate);
  });
}

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export default function Settings() {
  const [patches, setPatches] = useState<Patch[]>([]);
  const [overrides, setOverrides] = useState<PatchOverride[]>([]);
  const [selectedPatchId, setSelectedPatchId] = useState("");
  const [originalUrl, setOriginalUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([loadStandardPatches(), loadStoredData()])
      .then(([standardPatches, storedData]) => {
        if (!active) return;
        const merged = applyPatchOverrides(
          mergePatchCollections(standardPatches, storedData.userPatches),
          storedData.overrides,
        );
        setPatches(merged);
        setOverrides(storedData.overrides);
        setSelectedPatchId(merged[0]?.id ?? "");
        setOriginalUrl(merged[0]?.URL ?? "");
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "設定を読み込めませんでした。",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedPatch =
    patches.find(({ id }) => id === selectedPatchId) ?? null;
  const isDirty =
    selectedPatch !== null && originalUrl.trim() !== (selectedPatch.URL ?? "");
  const canSave = useMemo(() => {
    const value = originalUrl.trim();
    return value === "" || isHttpUrl(value);
  }, [originalUrl]);

  const saveSettings = async () => {
    if (!selectedPatch || !isDirty || !canSave) return;

    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const currentOverride = overrides.find(
        ({ patchId }) => patchId === selectedPatch.id,
      );
      const nextOverride: PatchOverride = {
        ...currentOverride,
        patchId: selectedPatch.id,
        originalUrl: originalUrl.trim() || null,
      };
      await savePatchOverride(nextOverride);

      const nextOverrides = [
        ...overrides.filter(({ patchId }) => patchId !== selectedPatch.id),
        nextOverride,
      ];
      const nextPatches = applyPatchOverrides(patches, [nextOverride]);
      setOverrides(nextOverrides);
      setPatches(nextPatches);
      setOriginalUrl(nextPatches.find(({ id }) => id === selectedPatch.id)?.URL ?? "");
      setStatus("設定を保存しました。");
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "設定を保存できませんでした。",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="dashboard settings-page">
      <Link className="back-link" to="/">
        ← Patch Archive
      </Link>
      <div className="eyebrow">PATCH ARCHIVE</div>
      <h1>Settings</h1>
      <p className="intro">
        パッチごとのoriginalリンクを設定します。リンクはこのブラウザーに保存され、アーカイブ画面にも反映されます。
      </p>

      {loading ? (
        <p className="status-message">パッチを読み込み中…</p>
      ) : error && patches.length === 0 ? (
        <p className="error-message" role="alert">{error}</p>
      ) : patches.length === 0 ? (
        <p className="status-message">パッチノートがありません。</p>
      ) : (
        <section className="data-section settings-form">
          <label className="field-block">
            <span>Patch</span>
            <select
              value={selectedPatchId}
              onChange={(event) => {
                const nextPatch = patches.find(
                  ({ id }) => id === event.target.value,
                );
                setSelectedPatchId(event.target.value);
                setOriginalUrl(nextPatch?.URL ?? "");
                setError(null);
                setStatus(null);
              }}
              disabled={saving}
            >
              {patches.map((patch) => (
                <option key={patch.id} value={patch.id}>
                  {patch.title}
                </option>
              ))}
            </select>
          </label>

          <label className="field-block">
            <span>Original link</span>
            <input
              type="url"
              value={originalUrl}
              onChange={(event) => {
                setOriginalUrl(event.target.value);
                setError(null);
                setStatus(null);
              }}
              placeholder="https://example.com/patch-notes"
              disabled={saving}
            />
          </label>
          <p className="help-text">
            空欄にして保存するとリンクを削除します。http:// または https:// のURLを入力してください。
          </p>

          {error && <p className="error-message" role="alert">{error}</p>}
          {status && <p className="settings-save-status" role="status">{status}</p>}
          {!canSave && (
            <p className="error-message" role="alert">
              originalリンクには有効なHTTPまたはHTTPSのURLを入力してください。
            </p>
          )}

          <button
            className="primary-button"
            type="button"
            onClick={saveSettings}
            disabled={saving || !isDirty || !canSave}
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </section>
      )}
      <BalanceAssessmentEditor />
    </main>
  );
}
