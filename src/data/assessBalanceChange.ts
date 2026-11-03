import type { BalanceAssessment } from "../types/patch";

const positiveMetrics = [
  "damage",
  "dps",
  "healing",
  "heal",
  "health",
  "hp",
  "regeneration",
  "regen",
  "resistance",
  "lifesteal",
  "fire rate",
  "attack speed",
  "move speed",
  "movement speed",
  "range",
  "radius",
  "duration",
  "scaling",
  "barrier",
  "damage reduction",
  "ammo",
  "spirit power",
  "bullet velocity",
  "bounty",
  "souls",
];

const negativeMetrics = [
  "cooldown",
  "cost",
  "damage penalty",
  "penalty",
  "delay",
  "cast time",
  "self damage",
  "slow effectiveness",
];

const increaseWords =
  "(?:increased|increases|boosted|boosts|raised|raises|improved|improves|higher|more)";
const decreaseWords =
  "(?:reduced|reduces|decreased|decreases|lowered|lowers|shortened|shortens|less|lower)";
const numberPattern = "[+-]?\\d+(?:\\.\\d+)?";

type Direction = "increase" | "decrease";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasMetricDirection(
  text: string,
  metric: string,
  direction: string,
): boolean {
  const metricPattern = escapeRegExp(metric);
  return new RegExp(
    `(?:\\b${metricPattern}\\b[^.;!?]{0,50}\\b${direction}\\b|\\b${direction}\\b[^.;!?]{0,35}\\b${metricPattern}\\b)`,
    "i",
  ).test(text);
}

function getNumericDirections(
  text: string,
  metric: string,
): Direction[] {
  const metricPattern = escapeRegExp(metric);
  const comparisons = [
    new RegExp(
      `\\bfrom\\s+(${numberPattern})\\s*(?:%|[a-zA-Z/]+)?[^0-9.;!?]{0,20}?\\bto\\s+(${numberPattern})\\s*(?:%|[a-zA-Z/]+)?`,
      "g",
    ),
    new RegExp(
      `(${numberPattern})\\s*(?:%|[a-zA-Z/]+)?[^0-9.;!?]{0,25}\\b${metricPattern}\\b[^.;!?]{0,12}\\bto\\s+(${numberPattern})`,
      "g",
    ),
  ];
  const directions: Direction[] = [];

  for (const comparison of comparisons) {
    let match: RegExpExecArray | null;
    comparison.lastIndex = 0;
    while ((match = comparison.exec(text)) !== null) {
      const index = match.index ?? 0;
      const context = text.slice(
        Math.max(0, index - 45),
        index + match[0].length + 10,
      );
      if (!new RegExp(`\\b${metricPattern}\\b`, "i").test(context)) continue;

      const before = Number(match[1]);
      const after = Number(match[2]);
      if (before === after) continue;

      if (
        metric === "cooldown" &&
        /\bscaling\b/i.test(context) &&
        before < 0 &&
        after < 0
      ) {
        directions.push(after < before ? "decrease" : "increase");
      } else {
        directions.push(after > before ? "increase" : "decrease");
      }
    }
  }

  return directions;
}

function normalizeMetrics(text: string): string {
  let normalized = text
    .replace(/\bmax hp\b/gi, "max_hp")
    .replace(/\bself damage\b/gi, "self_damage")
    .replace(/\bdamage penalty\b/gi, "damage_penalty")
    .replace(/\bdamage reduction\b/gi, "damage_reduction")
    .replace(/\bslow effectiveness\b/gi, "slow_effectiveness");

  for (const metric of [...positiveMetrics, ...negativeMetrics]) {
    if (!metric.includes(" ")) continue;
    normalized = normalized.replace(
      new RegExp(escapeRegExp(metric), "gi"),
      metric.replace(/ /g, "_"),
    );
  }
  return normalized;
}

export function assessBalanceChange(text: string): BalanceAssessment {
  if (/\b(fixed|fixes|bug|issue|incorrect|broken)\b/i.test(text)) {
    return "unrated";
  }

  if (
    /\bno longer\s+(?:scales|gains|grants)\b/i.test(text) &&
    /\bscales with\b/i.test(text)
  ) {
    return "nerf";
  }

  if (
    /\bdiminishing\b[^.;!?]{0,35}\b(momentum|forward movement)\b/i.test(text) ||
    /\b(upward launch|horizontal speed)\b/i.test(text) ||
    /\bfalls? faster while\b/i.test(text) ||
    /\bends when\b[^.;!?]{0,35}\bdies\b/i.test(text)
  ) {
    return "adjust";
  }

  const normalizedText = normalizeMetrics(text);
  const directions = new Set<BalanceAssessment>();

  for (const metric of positiveMetrics) {
    const escapedMetric = metric.replace(/ /g, "_");
    const lexicalIncrease = hasMetricDirection(
      normalizedText,
      escapedMetric,
      increaseWords,
    );
    const lexicalDecrease = hasMetricDirection(
      normalizedText,
      escapedMetric,
      decreaseWords,
    );
    const numericDirections = getNumericDirections(normalizedText, escapedMetric);

    const directionsForMetric = lexicalIncrease
      ? ["increase"]
      : lexicalDecrease
        ? ["decrease"]
        : numericDirections;

    if (directionsForMetric.includes("increase")) {
      directions.add("buff");
    }
    if (directionsForMetric.includes("decrease")) {
      directions.add("nerf");
    }

    if (
      new RegExp(
        `-\\s*${numberPattern}\\s*%?[^.;!?]{0,25}\\b${escapeRegExp(escapedMetric)}\\b`,
        "i",
      ).test(normalizedText)
    ) {
      directions.add("nerf");
    }
  }

  for (const metric of negativeMetrics) {
    const escapedMetric = metric.replace(/ /g, "_");
    const lexicalIncrease = hasMetricDirection(
      normalizedText,
      escapedMetric,
      increaseWords,
    );
    const lexicalDecrease = hasMetricDirection(
      normalizedText,
      escapedMetric,
      decreaseWords,
    );
    const numericDirections = getNumericDirections(normalizedText, escapedMetric);

    const directionsForMetric =
      metric === "cooldown" &&
      /\bscaling\b/i.test(normalizedText) &&
      numericDirections.length > 0
        ? numericDirections
        : lexicalIncrease
          ? ["increase"]
          : lexicalDecrease
            ? ["decrease"]
            : numericDirections;

    if (directionsForMetric.includes("increase")) {
      directions.add("nerf");
    }
    if (directionsForMetric.includes("decrease")) {
      directions.add("buff");
    }
  }

  if (directions.has("buff") && directions.has("nerf")) {
    return "adjust";
  }
  if (directions.has("buff")) return "buff";
  if (directions.has("nerf")) return "nerf";

  if (/\bhalf damage\b/i.test(text)) return "nerf";

  const genericNumericChange = new RegExp(
    `\\b${increaseWords}\\s+from\\s+${numberPattern}[^.;!?]{0,20}?\\bto\\s+${numberPattern}`,
    "i",
  );
  if (genericNumericChange.test(text)) {
    return "buff";
  }

  return "unrated";
}
