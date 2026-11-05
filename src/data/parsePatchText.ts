import type {
  BalanceAssessment,
  Change,
  ChangeGroup,
  ChangeType,
  EntityType,
  NumericChange,
  Patch,
  PatchSection,
  SourceLine,
} from "../types/patch";
import { findPatchAttribute } from "./patchAttributeMaster";

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "patch"
  );
}

function normalizeSectionName(sectionText: string): PatchSection {
  const lowered = sectionText.toLowerCase();
  if (lowered.includes("another")) return "another";
  if (lowered.includes("street")) return "street_brawl";
  if (lowered.includes("hero")) return "heroes";
  if (lowered.includes("item")) return "items";
  if (lowered.includes("general")) return "general";
  return "another";
}

function inferEntityType(
  section: PatchSection,
  entitySection?: PatchSection,
): EntityType {
  const resolvedSection =
    section === "street_brawl" &&
    (entitySection === "heroes" || entitySection === "items")
      ? entitySection
      : section;

  switch (resolvedSection) {
    case "heroes":
      return "hero";
    case "items":
      return "item";
    case "street_brawl":
      return "world";
    case "another":
      return "system";
    default:
      return "system";
  }
}

function parseNumericTokens(raw: string): number | undefined {
  const match = raw.match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) ? value : undefined;
}

function extractNumericChanges(description: string): NumericChange[] {
  const results: NumericChange[] = [];

  const fromTo = description.match(
    /from\s+([+-]?\d+(?:\.\d+)?(?:%|[a-zA-Z]+)?)\s+to\s+([+-]?\d+(?:\.\d+)?(?:%|[a-zA-Z]+)?)/i,
  );
  if (fromTo) {
    const before = parseNumericTokens(fromTo[1]);
    const after = parseNumericTokens(fromTo[2]);
    if (before !== undefined && after !== undefined) {
      results.push({
        attribute: "value",
        before,
        after,
        unit: /%/.test(fromTo[1]) || /%/.test(fromTo[2]) ? "%" : undefined,
      });
    }
  }

  const byMatch = description.match(
    /(?:increased|decreased|reduced|raised|lowered|boosted)\s+(?:by\s+)?([+-]?\d+(?:\.\d+)?(?:%|[a-zA-Z]+)?)/i,
  );
  if (byMatch) {
    const value = parseNumericTokens(byMatch[1]);
    if (value !== undefined) {
      results.push({
        attribute: "value",
        after: value,
        unit: /%/.test(byMatch[1]) ? "%" : undefined,
      });
    }
  }

  return results;
}

function inferChangeType(description: string): ChangeType {
  const lowered = description.toLowerCase();
  if (/fixed|bug|issue|incorrect|broken/i.test(lowered)) {
    return "bug_fix";
  }
  if (/no longer|removed|removed from|now no longer|no longer has/i.test(lowered)) {
    return "removed";
  }
  if (/added|new|now has|now grants|now scales|now gains/i.test(lowered)) {
    return "added";
  }
  if (/increased|boosted|raised|reduced|decreased|lowered/i.test(lowered)) {
    return /decreased|reduced|lowered/.test(lowered)
      ? "value_decreased"
      : "value_increased";
  }
  if (/(changed|now|instead|from .* to .*|no longer)/i.test(lowered)) {
    return "behavior_changed";
  }
  return "other";
}

function isBalanceAssessment(value: string | undefined): value is BalanceAssessment {
  return (
    value === "buff" ||
    value === "nerf" ||
    value === "adjust" ||
    value === "unrated"
  );
}

function extractBalanceAssessment(
  line: string,
  lineNumber: number,
  warnings: string[],
): { text: string; assessment: BalanceAssessment } {
  const markerPattern = /\[BalanceAssessment:"([^"]+)"\]/g;
  const matches = [...line.matchAll(markerPattern)];
  const hasMarker = line.includes("[BalanceAssessment:");
  const text = line.replace(/\[BalanceAssessment:[^\]]*(?:\]|$)/g, "").trim();
  const assessment = matches[0]?.[1];

  if (!hasMarker) {
    return { text: line, assessment: "unrated" };
  }

  if (matches.length !== 1 || !isBalanceAssessment(assessment)) {
    warnings.push(
      `BalanceAssessment注釈を解析できません（行 ${lineNumber}）: ${line}`,
    );
    return { text, assessment: "unrated" };
  }

  return {
    text,
    assessment,
  };
}

function extractTargetDescription(rawText: string): {
  targetName?: string;
  description: string;
} {
  const matched = rawText.match(/^(.+?)\s*-\s*(.+)$/);
  if (!matched) {
    return { description: rawText };
  }

  const before = matched[1].trim();
  const after = matched[2].trim();
  if (
    !before ||
    !after ||
    before.length < 3 ||
    /^(increased|decreased|reduced|fixed|added|removed)$/i.test(before)
  ) {
    return { description: rawText };
  }

  return { targetName: before, description: after };
}

export function parsePatchText(
  rawText: string,
  title: string,
  publishedAt?: string,
): { patch: Patch; warnings: string[] } {
  const lines = rawText.split(/\r?\n/);
  const sourceLines: SourceLine[] = [];
  const groups = new Map<string, ChangeGroup>();
  const warnings: string[] = [];

  let currentSection: PatchSection | null = null;
  let firstNonEmptyLine = true;
  let sourceUrl: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const original = lines[index];
    const trimmed = original.trim();
    if (!trimmed) continue;

    const sourceUrlMatch = trimmed.match(/^- URL:\s*(.+)$/);
    if (sourceUrlMatch) {
      sourceUrl = sourceUrlMatch[1].trim();
      continue;
    }

    const sectionMatch = trimmed.match(/^([A-Za-z][A-Za-z ]+):\s*$/);
    if (sectionMatch) {
      currentSection = normalizeSectionName(sectionMatch[1]);
      firstNonEmptyLine = false;
      continue;
    }

    if (
      firstNonEmptyLine &&
      !trimmed.startsWith("-") &&
      !trimmed.includes(":")
    ) {
      firstNonEmptyLine = false;
      continue;
    }
    firstNonEmptyLine = false;

    const annotatedLine = extractBalanceAssessment(trimmed, index + 1, warnings);
    const content = annotatedLine.text.replace(/^-+\s*/, "");
    if (!content) continue;

    const entityMatch = content.match(/^(.+?):\s*(.+)$/);
    let entityName: string | null = null;
    let description = content;
    let inferredAttribute: ReturnType<typeof findPatchAttribute>;

    if (entityMatch) {
      entityName = entityMatch[1].trim();
      description = entityMatch[2].trim();
      inferredAttribute = findPatchAttribute(entityName);
    } else {
      inferredAttribute = findPatchAttribute(content, true);
      if (inferredAttribute) {
        entityName = inferredAttribute.name;
      }
    }

    const section: PatchSection = currentSection ??
      inferredAttribute?.section ??
      "another";

    if (
      section === "street_brawl" &&
      entityName === inferredAttribute?.name &&
      inferredAttribute.name === "Street Brawl"
    ) {
      const matchedEntity = findPatchAttribute(description, true);
      if (
        matchedEntity &&
        (matchedEntity.section === "heroes" ||
          matchedEntity.section === "items")
      ) {
        entityName = matchedEntity.name;
        description = description
          .slice(matchedEntity.name.length)
          .replace(/^\s*[-:]\s*/, "")
          .trim();
        inferredAttribute = matchedEntity;
      }
    }

    const resolvedEntityName: string =
      entityName ?? (section === "another" ? "Another" : section);

    const sourceLineId = `source-${index + 1}`;
    sourceLines.push({ id: sourceLineId, section, text: original });

    if (!description) {
      warnings.push(`解析できない行をスキップしました: ${trimmed}`);
      continue;
    }

    const targetInfo = extractTargetDescription(description);
    const groupKey = `${section}:${resolvedEntityName}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        id: `group-${slugify(`${resolvedEntityName}-${section}`)}-${groups.size + 1}`,
        section,
        entityType: inferEntityType(section, inferredAttribute?.section),
        entityId: slugify(resolvedEntityName),
        entityName: resolvedEntityName,
        balanceAssessment: "unrated",
        changes: [],
      });
    }

    const group = groups.get(groupKey)!;
    const numericChanges = extractNumericChanges(targetInfo.description);
    const change: Change = {
      id: `${group.id}-change-${group.changes.length + 1}`,
      targetName: targetInfo.targetName,
      description: targetInfo.description || description,
      changeType: inferChangeType(targetInfo.description),
      numericChanges: numericChanges.length > 0 ? numericChanges : undefined,
      balanceAssessment: annotatedLine.assessment,
      sourceLineIds: [sourceLineId],
    };

    group.changes.push(change);
  }

  const safeTitle = title.trim() || "Unnamed Patch";
  const finalPublishedAt = publishedAt || new Date().toISOString().slice(0, 10);
  const patchId = `${slugify(safeTitle)}-${finalPublishedAt.replace(/-/g, "")}`;

  return {
    patch: {
      schemaVersion: 1,
      id: patchId,
      game: "deadlock",
      title: safeTitle,
      publishedAt: finalPublishedAt,
      ...(sourceUrl ? { URL: sourceUrl } : {}),
      importedAt: new Date().toISOString(),
      sourceLines,
      changeGroups: [...groups.values()],
    },
    warnings,
  };
}
