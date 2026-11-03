import { useEffect, useMemo, useState } from "react";
import { assessBalanceChange } from "./data/assessBalanceChange";
import { loadStandardPatches } from "./data/patches";
import { AbilityImage, EntityImage } from "./PatchImages";
import { PATCH_SECTIONS } from "./types/patch";
import type {
  BalanceAssessment,
  Change,
  Patch,
  PatchSection,
} from "./types/patch";

const assessments: BalanceAssessment[] = [
  "buff",
  "nerf",
  "adjust",
  "unrated",
];

const sectionLabels: Record<PatchSection, string> = {
  general: "General",
  items: "Items",
  heroes: "Heroes",
  street_brawl: "Street Brawl",
  another: "Another",
};

type AssessmentDraft = Record<string, BalanceAssessment>;

function changeKey(patchId: string, changeId: string): string {
  return `${patchId}:${changeId}`;
}

function getAssessmentDrafts(patches: Patch[]): AssessmentDraft {
  return Object.fromEntries(
    patches.flatMap((patch) =>
      patch.changeGroups.flatMap((group) =>
        group.changes.map((change) => [
          changeKey(patch.id, change.id),
          change.balanceAssessment,
        ]),
      ),
    ),
  );
}

function getChangeLines(patch: Patch, change: Change): string[] {
  const linesById = new Map(
    patch.sourceLines.map((sourceLine) => [sourceLine.id, sourceLine.text]),
  );
  return change.sourceLineIds.flatMap((id) => {
    const text = linesById.get(id);
    return text === undefined ? [] : [text.trim()];
  });
}

export default function BalanceAssessmentEditor() {
  const [patches, setPatches] = useState<Patch[]>([]);
  const [selectedPatchId, setSelectedPatchId] = useState("");
  const [selectedSection, setSelectedSection] = useState<"all" | PatchSection>(
    "all",
  );
  const [selectedHeroesByPatch, setSelectedHeroesByPatch] = useState<
    Record<string, string[]>
  >({});
  const [heroFiltersOpen, setHeroFiltersOpen] = useState(false);
  const [drafts, setDrafts] = useState<AssessmentDraft>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadStandardPatches()
      .then((loadedPatches) => {
        if (!active) return;
        setPatches(loadedPatches);
        setSelectedPatchId(loadedPatches[0]?.id ?? "");
        setDrafts(getAssessmentDrafts(loadedPatches));
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "パッチノートを読み込めませんでした。",
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
  const changes = useMemo(
    () =>
      selectedPatch?.changeGroups.flatMap((group) =>
        group.changes.map((change) => ({ group, change })),
      ) ?? [],
    [selectedPatch],
  );
  const heroGroups =
    selectedPatch?.changeGroups.filter(
      (group) => group.section === "heroes" && group.entityType === "hero",
    ) ?? [];
  const heroIds = [...new Set(heroGroups.map(({ entityId }) => entityId))];
  const selectedHeroIds = selectedPatch
    ? selectedHeroesByPatch[selectedPatch.id] ?? heroIds
    : [];
  const visibleGroups =
    selectedPatch?.changeGroups.filter(
      (group) =>
        (selectedSection === "all" || group.section === selectedSection) &&
        (selectedSection !== "heroes" ||
          group.entityType !== "hero" ||
          selectedHeroIds.includes(group.entityId)),
    ) ?? [];
  const availableSections = PATCH_SECTIONS.filter(
    (section) =>
      section !== "another" ||
      selectedPatch?.changeGroups.some((group) => group.section === section),
  );
  const dirtyChanges = selectedPatch
    ? changes.filter(
        ({ change }) =>
          drafts[changeKey(selectedPatch.id, change.id)] !==
          change.balanceAssessment,
      )
    : [];
  const changesEligibleForAutoAssessment = selectedPatch
    ? changes.filter(({ change }) => {
        const sourceLines = getChangeLines(selectedPatch, change);
        const isManuallyAnnotated = sourceLines.some((line) =>
          line.includes("[BalanceAssessment:"),
        );
        const currentDraft =
          drafts[changeKey(selectedPatch.id, change.id)] ??
          change.balanceAssessment;
        return (
          !isManuallyAnnotated &&
          change.balanceAssessment === "unrated" &&
          currentDraft === change.balanceAssessment
        );
      })
    : [];

  const updateAssessment = (
    change: Change,
    assessment: BalanceAssessment,
  ) => {
    if (!selectedPatch) return;
    setDrafts((current) => ({
      ...current,
      [changeKey(selectedPatch.id, change.id)]: assessment,
    }));
    setStatus(null);
  };

  const toggleHero = (heroId: string) => {
    if (!selectedPatch) return;
    setSelectedHeroesByPatch((current) => {
      const selected = current[selectedPatch.id] ?? heroIds;
      return {
        ...current,
        [selectedPatch.id]: selected.includes(heroId)
          ? selected.filter((id) => id !== heroId)
          : [...selected, heroId],
      };
    });
  };

  const selectAllHeroes = (heroIdsToSelect: string[]) => {
    if (!selectedPatch) return;
    setSelectedHeroesByPatch((current) => ({
      ...current,
      [selectedPatch.id]: heroIdsToSelect,
    }));
  };

  const changeSection = (section: "all" | PatchSection) => {
    setSelectedSection(section);
    setHeroFiltersOpen(false);
    if (selectedPatch) {
      selectAllHeroes(heroIds);
    }
  };

  const autoAssessChanges = () => {
    if (!selectedPatch || changesEligibleForAutoAssessment.length === 0) return;

    const assessmentsByChange = Object.fromEntries(
      changesEligibleForAutoAssessment.map(({ change }) => {
        const sourceText = getChangeLines(selectedPatch, change)
          .map((line) => line.replace(/\s*\[BalanceAssessment:[^\]]*\]/g, ""))
          .join(" ");
        const assessment = assessBalanceChange(sourceText);
        return [changeKey(selectedPatch.id, change.id), assessment];
      }),
    );
    const counts = Object.values(assessmentsByChange).reduce(
      (result, assessment) => {
        result[assessment] += 1;
        return result;
      },
      { buff: 0, nerf: 0, adjust: 0, unrated: 0 },
    );
    setDrafts((current) => ({ ...current, ...assessmentsByChange }));
    setStatus(
      `自動評価: ${changesEligibleForAutoAssessment.length}件を判定しました（BUFF ${counts.buff} / NERF ${counts.nerf} / ADJUST ${counts.adjust} / UNRATED ${counts.unrated}）。内容を確認して保存してください。`,
    );
  };

  const saveAssessments = async () => {
    if (!selectedPatch || dirtyChanges.length === 0) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}__dev/patch-assessments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patchId: selectedPatch.id,
            changes: dirtyChanges.flatMap(({ change }) =>
              change.sourceLineIds.map((sourceLineId) => ({
                sourceLineId,
                assessment:
                  drafts[changeKey(selectedPatch.id, change.id)],
              })),
            ),
          }),
        },
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `保存に失敗しました (${response.status})`);
      }

      const updatedPatches = await loadStandardPatches();
      setPatches(updatedPatches);
      setDrafts(getAssessmentDrafts(updatedPatches));
      setStatus(`${dirtyChanges.length}件のアセスメントを保存しました。`);
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "アセスメントを保存できませんでした。",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="assessment-editor-page">
      <div className="eyebrow">DEVELOPMENT TOOL</div>
      <h2>Balance Assessments</h2>
      <p className="intro">
        各変更の評価を手動選択するか、未評価の変更を判断基準に基づいて自動設定します。内容を確認して保存すると、パッチノート原文に反映されます。
      </p>

      {loading ? (
        <p className="status-message">パッチを読み込み中…</p>
      ) : error && patches.length === 0 ? (
        <p className="error-message" role="alert">{error}</p>
      ) : patches.length === 0 ? (
        <p className="status-message">パッチノートがありません。</p>
      ) : (
        <>
          <section className="data-section assessment-editor-toolbar">
            <label className="field-block">
              <span>Patch</span>
              <select
                value={selectedPatchId}
                onChange={(event) => {
                  setSelectedPatchId(event.target.value);
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
            <button
              className="secondary-button"
              type="button"
              onClick={autoAssessChanges}
              disabled={saving || changesEligibleForAutoAssessment.length === 0}
              title="手動評価を維持し、未評価の変更だけを保守的に判定します"
            >
              自動でアセスメント設定 (
              {changesEligibleForAutoAssessment.length})
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={saveAssessments}
              disabled={saving || dirtyChanges.length === 0}
            >
              {saving
                ? "Saving…"
                : `Save assessments (${dirtyChanges.length})`}
            </button>
          </section>

          {error && <p className="error-message" role="alert">{error}</p>}
          {status && <p className="assessment-save-status" role="status">{status}</p>}

          <section className="assessment-categories" aria-label="Change Categories">
            <h2 className="section-heading">Change Categories</h2>
            <div className="section-tabs" aria-label="Patch sections">
              {(["all", ...availableSections] as const).map((section) => (
                <button
                  key={section}
                  type="button"
                  className={
                    section === selectedSection
                      ? "tab-button active"
                      : "tab-button"
                  }
                  onClick={() => changeSection(section)}
                >
                  {section === "all" ? "All" : sectionLabels[section]}
                </button>
              ))}
            </div>
            {selectedSection === "heroes" && heroGroups.length > 0 && (
              <div className="hero-filter-panel">
                <div className="hero-filter-toolbar">
                  <button
                    type="button"
                    className={`hero-filter-toggle${heroFiltersOpen ? " active" : ""}`}
                    aria-label={
                      heroFiltersOpen
                        ? "Hide hero filters"
                        : "Show hero filters"
                    }
                    aria-expanded={heroFiltersOpen}
                    aria-controls="assessment-hero-filters"
                    onClick={() => setHeroFiltersOpen((open) => !open)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M4 5h16l-6.5 7.5v5L10.5 19v-6.5L4 5Z" />
                    </svg>
                  </button>
                  <span className="hero-filter-count">
                    {selectedHeroIds.length} / {heroIds.length} heroes selected
                  </span>
                </div>
                {heroFiltersOpen && (
                  <div
                    className="hero-filters"
                    id="assessment-hero-filters"
                    aria-label="Filter changes by hero"
                  >
                    <div className="hero-filter-actions">
                      <button
                        type="button"
                        className="hero-filter-action"
                        onClick={() => selectAllHeroes(heroIds)}
                        disabled={selectedHeroIds.length === heroIds.length}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="hero-filter-action"
                        onClick={() => selectAllHeroes([])}
                        disabled={selectedHeroIds.length === 0}
                      >
                        Clear all
                      </button>
                    </div>
                    {heroGroups
                      .filter(
                        (group, index, groups) =>
                          groups.findIndex(
                            ({ entityId }) => entityId === group.entityId,
                          ) === index,
                      )
                      .map((group) => {
                        const isSelected = selectedHeroIds.includes(
                          group.entityId,
                        );
                        return (
                          <button
                            key={group.entityId}
                            className={`hero-filter-button${isSelected ? " selected" : ""}`}
                            type="button"
                            aria-label={`${group.entityName}: ${isSelected ? "selected" : "not selected"}`}
                            aria-pressed={isSelected}
                            title={group.entityName}
                            onClick={() => toggleHero(group.entityId)}
                          >
                            <EntityImage
                              entityType="hero"
                              entityId={group.entityId}
                            />
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="assessment-change-list" aria-label="Patch changes">
            {!selectedPatch || visibleGroups.length === 0 ? (
              <p className="status-message">
                {selectedSection === "heroes" && heroGroups.length > 0
                  ? "ヒーローが選択されていません。"
                  : "このカテゴリに変更はありません。"}
              </p>
            ) : visibleGroups.map((group) => (
              <article className="assessment-group" key={group.id}>
                <h2>
                  <EntityImage
                    entityType={group.entityType}
                    entityId={group.entityId}
                  />
                  <span>{group.entityName}</span>
                </h2>
                {group.changes.map((change) => (
                  <div className="assessment-change" key={change.id}>
                    <div className="assessment-change-content">
                      <div className="assessment-change-heading">
                        {group.entityType === "hero" && change.targetName && (
                          <AbilityImage
                            heroId={group.entityId}
                            abilityName={change.targetName}
                          />
                        )}
                        <strong>
                          {change.targetName
                            ? `${change.targetName}: ${change.description}`
                            : change.description}
                        </strong>
                      </div>
                      <ul className="assessment-source-lines">
                        {getChangeLines(selectedPatch, change).map((line, index) => (
                          <li key={`${change.id}-source-${index}`}>{line}</li>
                        ))}
                      </ul>
                    </div>
                    <label className="field-inline assessment-select">
                      <span>Assessment</span>
                      <select
                        value={
                          drafts[changeKey(selectedPatch.id, change.id)] ??
                          change.balanceAssessment
                        }
                        onChange={(event) =>
                          updateAssessment(
                            change,
                            event.target.value as BalanceAssessment,
                          )
                        }
                        disabled={saving}
                      >
                        {assessments.map((assessment) => (
                          <option key={assessment} value={assessment}>
                            {assessment.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ))}
              </article>
            ))}
          </section>
        </>
      )}
    </section>
  );
}
