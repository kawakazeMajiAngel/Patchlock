import { useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { loadStandardPatches } from "./data/patches";
import { loadStoredData } from "./data/storage";
import BalanceAssessmentEditor from "./BalanceAssessmentEditor";
import { AbilityImage, EntityImage } from "./PatchImages";
import { PATCH_SECTIONS } from "./types/patch";
import type {
  BalanceAssessment,
  Patch,
  PatchSection,
} from "./types/patch";

const SECTION_LABELS: Record<PatchSection, string> = {
  general: "General",
  items: "Items",
  heroes: "Heroes",
  street_brawl: "Street Brawl",
  another: "Another",
};

const BALANCE_ASSESSMENTS: BalanceAssessment[] = [
  "buff",
  "nerf",
  "adjust",
  "unrated",
];

function emphasizeNumericValues(text: string) {
  const parts: React.ReactNode[] = [];
  const numericValuePattern =
    /(?<![A-Za-z0-9])[+-]?\d+(?:\.\d+)?(?:%|[a-zA-Z]+(?:\/[a-zA-Z]+)?|°)?/g;
  let lastIndex = 0;

  for (const match of text.matchAll(numericValuePattern)) {
    const value = match[0];
    const start = match.index;
    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start));
    }
    parts.push(<strong key={`${start}-${value}`}>{value}</strong>);
    lastIndex = start + value.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function mergePatchCollections(...sets: Patch[][]): Patch[] {
  return [...sets.flat()].sort((left, right) => {
    const leftDate = left.publishedAt ?? left.importedAt;
    const rightDate = right.publishedAt ?? right.importedAt;
    return rightDate.localeCompare(leftDate);
  });
}

function formatPatchDate(patch: Patch | null): string {
  if (!patch) return "—";

  const date = patch.publishedAt ?? patch.importedAt;
  const match =
    date.match(/(\d{4})[-./]?(\d{2})[-./]?(\d{2})/) ??
    patch.title.match(/patchnote_(\d{4})(\d{2})(\d{2})/i);

  return match ? `${match[1]}.${match[2]}.${match[3]}` : date;
}

function Archive() {
  const [patches, setPatches] = useState<Patch[]>([]);
  const [selectedPatchId, setSelectedPatchId] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<"all" | PatchSection>("all");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [selectedHeroesByPatch, setSelectedHeroesByPatch] = useState<
    Record<string, string[]>
  >({});
  const [heroFiltersOpen, setHeroFiltersOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => {
    let active = true;

    Promise.all([loadStandardPatches(), loadStoredData()])
      .then(([standardPatches, storedData]) => {
        if (!active) return;
        const merged = mergePatchCollections(standardPatches, storedData.userPatches);
        setPatches(merged);
        if (merged.length > 0) {
          setSelectedPatchId((current) => current ?? merged[0].id);
        }
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load patch data.",
        );
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const targetPatchId =
      (location.state as { patchId?: string; section?: PatchSection } | null)
        ?.patchId ?? selectedPatchId;
    if (targetPatchId && patches.some(({ id }) => id === targetPatchId)) {
      setSelectedPatchId(targetPatchId);
    }
    const targetSection =
      (location.state as { patchId?: string; section?: PatchSection } | null)
        ?.section ?? selectedSection;
    if (targetSection) {
      setSelectedSection(targetSection);
    }
  }, [location.state, patches, selectedPatchId, selectedSection]);

  useEffect(() => {
    if (!selectedPatchId) return;
    const selectedPatch = patches.find(({ id }) => id === selectedPatchId);
    if (!selectedPatch) return;
    setExpandedGroups((current) => {
      const next = { ...current };
      for (const group of selectedPatch.changeGroups) {
        if (next[group.id] === undefined) {
          next[group.id] = true;
        }
      }
      return next;
    });
  }, [patches, selectedPatchId]);

  const selectedPatch = patches.find(({ id }) => id === selectedPatchId) ?? patches[0] ?? null;
  const currentIndex = selectedPatch
    ? patches.findIndex(({ id }) => id === selectedPatch.id)
    : -1;
  const previousPatch = currentIndex > 0 ? patches[currentIndex - 1] : null;
  const nextPatch = currentIndex >= 0 && currentIndex < patches.length - 1 ? patches[currentIndex + 1] : null;
  const timelineStart = Math.max(0, Math.min(currentIndex - 3, patches.length - 8));
  const timelinePatches = selectedPatch
    ? patches.slice(timelineStart, timelineStart + 8).reverse()
    : [];
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
  const heroCount = new Set(
    selectedPatch?.changeGroups
      .filter(({ entityType }) => entityType === "hero")
      .map(({ entityId }) => entityId),
  ).size;
  const itemCount = new Set(
    selectedPatch?.changeGroups
      .filter(({ entityType }) => entityType === "item")
      .map(({ entityId }) => entityId),
  ).size;
  const toggleGroup = (groupId: string) => {
    setExpandedGroups((current) => ({
      ...current,
      [groupId]: !(current[groupId] ?? true),
    }));
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
  const selectAllHeroes = (heroIds: string[]) => {
    if (!selectedPatch) return;
    setSelectedHeroesByPatch((current) => ({
      ...current,
      [selectedPatch.id]: heroIds,
    }));
  };
  const changeSection = (section: "all" | PatchSection) => {
    setSelectedSection(section);
    setHeroFiltersOpen(false);
    if (selectedPatch) {
      selectAllHeroes(heroIds);
    }
  };

  return (
    <main className="dashboard archive-page">
      <header className="archive-header">
        <Link className="archive-brand" to="/">
          PATCH ARCHIVE
        </Link>
        <nav className="archive-nav" aria-label="Main navigation">
          <Link to="/search">Search</Link>
          {import.meta.env.DEV && <Link to="/assessments">Assessments</Link>}
        </nav>
      </header>
      {error ? (
        <p className="error-message">{error}</p>
      ) : !selectedPatch ? (
        <p className="status-message">Loading patches…</p>
      ) : (
        <>
          <section className="patch-overview" aria-label="Selected patch">
            <div className="patch-timeline-current-row">
              <button
                className="patch-timeline-arrow"
                type="button"
                aria-label="Older patch"
                onClick={() => nextPatch && setSelectedPatchId(nextPatch.id)}
                disabled={!nextPatch}
              >
                ‹
              </button>
              <div className="patch-timeline-current">
                {currentIndex === 0 && (
                  <span className="latest-badge">Latest</span>
                )}
                <strong>{formatPatchDate(selectedPatch)}</strong>

                {selectedPatch.URL && (
                  <a
                    className="source-link"
                    href={selectedPatch.URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    original
                  </a>
                )}
              </div>
              <button
                className="patch-timeline-arrow"
                type="button"
                aria-label="Newer patch"
                onClick={() => previousPatch && setSelectedPatchId(previousPatch.id)}
                disabled={!previousPatch}
              >
                ›
              </button>
            </div>
            <div className="patch-timeline-labels" aria-hidden="true">
              <span>PREVIOUS</span>
              <span>NEXT</span>
            </div>
            <div className="patch-timeline-track" aria-label="Patch history">
              {timelinePatches.map((patch) => (
                <button
                  key={patch.id}
                  className={`patch-timeline-segment${patch.id === selectedPatch.id ? " active" : ""}`}
                  type="button"
                  aria-label={`Show patch ${formatPatchDate(patch)}`}
                  aria-current={patch.id === selectedPatch.id ? "date" : undefined}
                  onClick={() => setSelectedPatchId(patch.id)}
                />
              ))}
            </div>
            <div className="patch-timeline-neighbors">
              <div>
                <strong>{formatPatchDate(nextPatch)}</strong>
              </div>
              <div>
                <strong>{formatPatchDate(previousPatch)}</strong>
              </div>
            </div>
          </section>

          <section className="archive-stats" aria-label="Affected entity counts">
            <div className="archive-stat">
              <svg
                className="stat-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="9" cy="7" r="3" />
                <path d="M3 20v-1a6 6 0 0 1 12 0v1M16 4.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 4.6V20" />
              </svg>
              <h2 className="stat-title">Heroes</h2>
              <strong>{heroCount}</strong>
              <span>Affected</span>
            </div>
            <div className="archive-stat">
              <svg
                className="stat-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
                <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
              </svg>
              <h2>Items</h2>
              <strong>{itemCount}</strong>
              <span>Affected</span>
            </div>
          </section>

          <section className="archive-list-section">
            <h2 className="section-heading">Change Categories</h2>
            <div className="section-tabs" aria-label="Patch sections">
              {(["all", ...availableSections] as const).map((section) => (
                <button
                  key={section}
                  type="button"
                  className={section === selectedSection ? "tab-button active" : "tab-button"}
                  onClick={() => changeSection(section)}
                >
                  {section === "all" ? "All" : SECTION_LABELS[section]}
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
                    aria-controls="hero-filters"
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
                    id="hero-filters"
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

            <div className="archive-content">
              {visibleGroups.length === 0 ? (
                <p className="help-text">
                  {selectedSection === "heroes" && heroGroups.length > 0
                    ? "No heroes selected."
                    : "There are no changes in this section."}
                </p>
              ) : (
                visibleGroups.map((group) => {
                  const isOpen = expandedGroups[group.id] ?? true;
                  return (
                    <div key={group.id} className="archive-group">
                      <button type="button" className="group-toggle" onClick={() => toggleGroup(group.id)}>
                        <span className="group-heading">
                          <EntityImage
                            entityType={group.entityType}
                            entityId={group.entityId}
                          />
                          <span className="group-title">
                            <strong>{group.entityName}</strong>

                          </span>
                        </span>
                      </button>
                      {isOpen && (
                        <ul className="change-list">
                          {group.changes.map((change) => {
                            return (
                              <li key={change.id} className="change-item">
                                <AbilityImage
                                  heroId={group.entityId}
                                  abilityName={
                                    group.entityType === "hero"
                                      ? change.targetName
                                      : undefined
                                  }
                                />
                                <div className="change-title">
                                  {emphasizeNumericValues(
                                    change.targetName
                                      ? `${change.targetName}: ${change.description}`
                                      : change.description,
                                  )}
                                </div>
                                {change.balanceAssessment !== "unrated" && (
                                  <span
                                    className={`group-badge assessment-${change.balanceAssessment}`}
                                    aria-label={`Change assessment: ${change.balanceAssessment}`}
                                  >
                                    {change.balanceAssessment.toUpperCase()}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>

        </>
      )}
    </main>
  );
}

function Search() {
  const [patches, setPatches] = useState<Patch[]>([]);
  const [query, setQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState<"all" | PatchSection>("all");
  const [assessmentFilter, setAssessmentFilter] = useState<"all" | BalanceAssessment>("all");
  const [entityFilter, setEntityFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    Promise.all([loadStandardPatches(), loadStoredData()])
      .then(([standardPatches, storedData]) => {
        if (!active) return;
        setPatches(mergePatchCollections(standardPatches, storedData.userPatches));
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load search data.",
        );
      });

    return () => {
      active = false;
    };
  }, []);

  const results = useMemo(() => {
    const loweredQuery = query.trim().toLowerCase();

    return patches.flatMap((patch) =>
      patch.changeGroups.flatMap((group) =>
        group.changes
          .filter((change) => {
            if (sectionFilter !== "all" && group.section !== sectionFilter) return false;
            if (assessmentFilter !== "all" && change.balanceAssessment !== assessmentFilter) {
              return false;
            }
            if (entityFilter.trim()) {
              const entityTarget = entityFilter.trim().toLowerCase();
              if (!group.entityName.toLowerCase().includes(entityTarget) && !(change.targetName ?? "").toLowerCase().includes(entityTarget)) {
                return false;
              }
            }
            if (!loweredQuery) return true;
            const haystacks = [
              patch.title,
              ...patch.sourceLines.map(({ text }) => text),
              group.entityName,
              change.description,
              change.targetName ?? "",
              change.changeType,
            ].join(" ").toLowerCase();
            return haystacks.includes(loweredQuery);
          })
          .map((change) => ({ patch, group, change })),
      ),
    );
  }, [assessmentFilter, entityFilter, patches, query, sectionFilter]);

  return (
    <main className="dashboard search-page">
      <Link className="back-link" to="/">
        ← Archive
      </Link>
      <div className="eyebrow">DEADLOCK · PATCH ARCHIVE</div>
      <h1>Search</h1>

      <section className="data-section search-panel">
        <div className="search-filters">
          <label className="field-block">
            <span>Search Query</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Heroes, abilities, changes, etc."
            />
          </label>
          <label className="field-inline compact-field">
            <span>Section</span>
            <select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value as "all" | PatchSection)}>
              <option value="all">All</option>
              {PATCH_SECTIONS.map((section) => (
                <option key={section} value={section}>
                  {SECTION_LABELS[section]}
                </option>
              ))}
            </select>
          </label>
          <label className="field-inline compact-field">
            <span>Assessment</span>
            <select value={assessmentFilter} onChange={(event) => setAssessmentFilter(event.target.value as "all" | BalanceAssessment)}>
              <option value="all">All</option>
              {BALANCE_ASSESSMENTS.map((assessment) => (
                <option key={assessment} value={assessment}>
                  {assessment.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="field-block">
            <span>Entity</span>
            <input
              value={entityFilter}
              onChange={(event) => setEntityFilter(event.target.value)}
              placeholder="e.g. Abrams, Shadow Weave"
            />
          </label>
        </div>
      </section>

      <section className="data-section results-panel">
        {error ? (
          <p className="error-message">{error}</p>
        ) : results.length === 0 ? (
          <p className="help-text">No changes match your search criteria.</p>
        ) : (
          <ul className="search-results">
            {results.map(({ patch, group, change }) => (
              <li key={`${patch.id}-${group.id}-${change.id}`} className="search-result-item">
                <button type="button" className="result-button" onClick={() => navigate("/archive", { state: { patchId: patch.id, section: group.section } })}>
                  <div className="result-header">
                    <strong>{patch.title}</strong>
                    <span>{patch.publishedAt ?? patch.importedAt}</span>
                  </div>
                  <div className="result-row">
                    <span className="group-badge">{SECTION_LABELS[group.section]}</span>
                    <span className="group-badge subtle entity-badge">
                      <EntityImage
                        entityType={group.entityType}
                        entityId={group.entityId}
                      />
                      <span>{group.entityName}</span>
                    </span>
                    {change.balanceAssessment !== "unrated" && (
                      <span
                        className={`group-badge assessment-${change.balanceAssessment}`}
                        aria-label={`Change assessment: ${change.balanceAssessment}`}
                      >
                        {change.balanceAssessment.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="result-description">
                    {change.targetName ? `${change.targetName}: ${change.description}` : change.description}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Archive />} />
      <Route path="/archive" element={<Archive />} />
      <Route path="/search" element={<Search />} />
      <Route
        path="/assessments"
        element={
          import.meta.env.DEV ? <BalanceAssessmentEditor /> : <Archive />
        }
      />
      <Route path="*" element={<Archive />} />
    </Routes>
  );
}
