import type { EntityType } from "./types/patch";

const ENTITY_IMAGE_BASE_PATH = `${import.meta.env.BASE_URL}images`;
const ITEM_IMAGE_ID_OVERRIDES: Record<string, string> = {
  "high-velocity-rounds": "high-velocity_rounds",
  "hunter-s-aura": "hunter's_aura",
};

export function EntityImage({
  entityType,
  entityId,
}: {
  entityType: EntityType;
  entityId: string;
}) {
  if (entityType !== "hero" && entityType !== "item") return null;

  const directory = entityType === "hero" ? "heroes" : "items";
  const imageId =
    entityType === "item"
      ? ITEM_IMAGE_ID_OVERRIDES[entityId] ??
        entityId.toLowerCase().replace(/-/g, "_")
      : entityId;
  const fallbackPath = `${ENTITY_IMAGE_BASE_PATH}/${directory}/placeholder.svg`;

  return (
    <img
      className={`entity-image ${entityType}-image`}
      src={`${ENTITY_IMAGE_BASE_PATH}/${directory}/${imageId}.png`}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={(event) => {
        if (event.currentTarget.dataset.fallbackApplied === "true") return;
        event.currentTarget.dataset.fallbackApplied = "true";
        event.currentTarget.src = fallbackPath;
      }}
    />
  );
}

export function AbilityImage({
  heroId,
  abilityName,
}: {
  heroId: string;
  abilityName: string | undefined;
}) {
  const heroDirectory = heroId.replace(/-/g, "_");
  const abilityFile = (abilityName ?? "")
    .toLowerCase()
    .trim()
    .replace(/'/g, "%2527")
    .replace(/[^a-z0-9%]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return (
    <span className="ability-image-slot" aria-hidden="true">
      {abilityFile && (
        <img
          src={`${ENTITY_IMAGE_BASE_PATH}/abilities/${heroDirectory}/${abilityFile}.png`}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
    </span>
  );
}
