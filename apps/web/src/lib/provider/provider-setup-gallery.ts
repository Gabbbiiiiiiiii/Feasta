import {
  menuAssetPublicId,
} from "./provider-menu";

export const PROVIDER_SETUP_LIMIT = 12;
export const PROVIDER_SETUP_IMAGE_LIMIT = 6;
export const PROVIDER_SETUP_THEME_TAG_LIMIT = 8;

export const PROVIDER_SETUP_EVENT_TYPES = [
  "birthday",
  "wedding",
  "debut",
  "corporate",
  "anniversary",
  "other",
] as const;

export type ProviderSetupEventType =
  (typeof PROVIDER_SETUP_EVENT_TYPES)[number];

export type ProviderSetup = {
  id: string;
  title: string;
  description: string;
  eventType: ProviderSetupEventType;
  themeTags: string[];
  imageUrls: string[];
  isPublished: boolean;
};

export type ProviderSetupGallery = {
  revision: number;
  setups: ProviderSetup[];
};

export function parseProviderSetups(
  value: unknown,
  ownerId: string,
): ProviderSetup[] {
  if (value === undefined) {
    return [];
  }

  if (
    !Array.isArray(value) ||
    value.length > PROVIDER_SETUP_LIMIT
  ) {
    throw new Error(
      `Choose at most ${PROVIDER_SETUP_LIMIT} previous event setups.`,
    );
  }

  const ids =
    new Set<string>();

  return value.map(
    (
      entry: unknown,
      index,
    ) => {
      if (
        !entry ||
        typeof entry !== "object" ||
        Array.isArray(entry)
      ) {
        throw new Error(
          `Setup ${index + 1} is invalid.`,
        );
      }

      const setup =
        entry as Record<
          string,
          unknown
        >;

      const id =
        requiredId(
          setup.id,
          `Setup ${index + 1}`,
        );

      if (ids.has(id)) {
        throw new Error(
          "Setup identifiers must be unique.",
        );
      }

      ids.add(id);

      const title =
        requiredText(
          setup.title,
          120,
          `Setup ${index + 1} title`,
        );

      const description =
        optionalText(
          setup.description,
          800,
          `Setup ${index + 1} description`,
        );

      const eventType =
        parseEventType(
          setup.eventType,
          index,
        );

      const themeTags =
        parseThemeTags(
          setup.themeTags,
          index,
        );

      const imageUrls =
        parseSetupImages(
          setup.imageUrls,
          ownerId,
          index,
        );

      if (
        typeof setup.isPublished !==
        "boolean"
      ) {
        throw new Error(
          `Setup ${index + 1} publication status is invalid.`,
        );
      }

      if (
        setup.isPublished &&
        imageUrls.length === 0
      ) {
        throw new Error(
          `Setup ${index + 1} needs at least one photo before publishing.`,
        );
      }

      return {
        id,
        title,
        description,
        eventType,
        themeTags,
        imageUrls,
        isPublished:
          setup.isPublished,
      };
    },
  );
}

export function publicProviderSetups(
  value: unknown,
  ownerId: string,
): ProviderSetup[] {
  try {
    return parseProviderSetups(
      value,
      ownerId,
    ).filter(
      (setup) =>
        setup.isPublished &&
        setup.imageUrls.length > 0,
    );
  }
  catch {
    return [];
  }
}

function parseEventType(
  value: unknown,
  index: number,
): ProviderSetupEventType {
  if (
    typeof value !== "string" ||
    !(
      PROVIDER_SETUP_EVENT_TYPES as
        readonly string[]
    ).includes(value)
  ) {
    throw new Error(
      `Setup ${index + 1} event type is invalid.`,
    );
  }

  return value as ProviderSetupEventType;
}

function parseThemeTags(
  value: unknown,
  index: number,
): string[] {
  if (
    !Array.isArray(value) ||
    value.length >
      PROVIDER_SETUP_THEME_TAG_LIMIT
  ) {
    throw new Error(
      `Setup ${index + 1} can have at most ${PROVIDER_SETUP_THEME_TAG_LIMIT} theme tags.`,
    );
  }

  const result =
    new Set<string>();

  for (const item of value) {
    if (
      typeof item !== "string"
    ) {
      throw new Error(
        `Setup ${index + 1} has an invalid theme tag.`,
      );
    }

    const normalized =
      item
        .trim()
        .replace(/\s+/gu, " ");

    if (
      !normalized ||
      normalized.length > 40
    ) {
      throw new Error(
        `Setup ${index + 1} has an invalid theme tag.`,
      );
    }

    result.add(normalized);
  }

  return [...result];
}

function parseSetupImages(
  value: unknown,
  ownerId: string,
  index: number,
): string[] {
  if (
    !Array.isArray(value) ||
    value.length >
      PROVIDER_SETUP_IMAGE_LIMIT
  ) {
    throw new Error(
      `Setup ${index + 1} can have at most ${PROVIDER_SETUP_IMAGE_LIMIT} photos.`,
    );
  }

  const result =
    new Set<string>();

  for (const item of value) {
    if (
      typeof item !== "string" ||
      item.length > 2048 ||
      !menuAssetPublicId(
        item,
        ownerId,
      )
    ) {
      throw new Error(
        `Setup ${index + 1} contains an invalid photo.`,
      );
    }

    result.add(item);
  }

  return [...result];
}

function requiredId(
  value: unknown,
  field: string,
): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/u.test(
      value,
    )
  ) {
    throw new Error(
      `${field} identifier is invalid.`,
    );
  }

  return value;
}

function requiredText(
  value: unknown,
  maximumLength: number,
  field: string,
): string {
  if (typeof value !== "string") {
    throw new Error(
      `${field} is invalid.`,
    );
  }

  const normalized =
    value
      .trim()
      .replace(/\s+/gu, " ");

  if (
    !normalized ||
    normalized.length >
      maximumLength
  ) {
    throw new Error(
      `${field} is invalid.`,
    );
  }

  return normalized;
}

function optionalText(
  value: unknown,
  maximumLength: number,
  field: string,
): string {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  if (typeof value !== "string") {
    throw new Error(
      `${field} is invalid.`,
    );
  }

  const normalized =
    value
      .trim()
      .replace(/\s+/gu, " ");

  if (
    normalized.length >
      maximumLength
  ) {
    throw new Error(
      `${field} is too long.`,
    );
  }

  return normalized;
}