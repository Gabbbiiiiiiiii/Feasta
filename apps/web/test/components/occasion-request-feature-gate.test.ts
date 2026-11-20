import {afterEach, describe, expect, it, vi} from "vitest";
import {occasionRequestsAvailable} from "@/lib/provider/provider-occasion-suggestions";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("provider occasion request feature gate", () => {
  it("remains disabled without explicit opt-in", () => {
    vi.stubEnv("NEXT_PUBLIC_FEASTA_OCCASION_REQUESTS_ENABLED", "");
    expect(occasionRequestsAvailable()).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_FEASTA_OCCASION_REQUESTS_ENABLED", "false");
    expect(occasionRequestsAvailable()).toBe(false);
  });

  it("enables the browser request UI only with explicit opt-in", () => {
    vi.stubEnv("NEXT_PUBLIC_FEASTA_OCCASION_REQUESTS_ENABLED", "true");
    expect(occasionRequestsAvailable()).toBe(true);
  });
});