import {publicProviderSetups, type ProviderSetup} from "./provider-setup-gallery";
import {parsePrivateProviderSetups} from "./provider-setup-gallery-v2";

/**
 * Customer V1-only projection from a gallery that may contain private V2 records.
 * Strictly validate the ENTIRE stored gallery: malformed or future-versioned
 * entries fail closed rather than getting stripped into legacy records.
 * Never expose V2 records here, even when they claim to be published or valid.
 * This is NOT a public V2 approval or activation mechanism.
 */
export function publicLegacyProviderSetupsFromMixed(
  value: unknown,
  ownerId: string,
): ProviderSetup[] {
  try {
    const stored = parsePrivateProviderSetups(value, ownerId, 10);
    const legacy = stored.filter((setup): setup is ProviderSetup =>
      setup.setupOccasionSchemaVersion !== 2);
    return publicProviderSetups(legacy, ownerId);
  } catch {
    return [];
  }
}
