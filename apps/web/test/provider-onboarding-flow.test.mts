import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";

import {
  firstIncompleteSetupStep,
  onboardingStepBySlug,
  onboardingStepState,
  providerOnboardingPath,
  PROVIDER_ONBOARDING_STEPS,
} from "../src/lib/provider/onboarding.ts";

describe("provider onboarding routing policy", () => {
  it("uses the canonical eight-step sequence", () => {
    assert.deepEqual(PROVIDER_ONBOARDING_STEPS.map((step) => step.slug), [
      "owner",
      "business",
      "services",
      "location",
      "capacity",
      "consent",
      "documents",
      "review",
    ]);
  });

  it("resumes at the first incomplete setup step", () => {
    assert.equal(firstIncompleteSetupStep([1, 2, 4]).slug, "services");
    assert.equal(firstIncompleteSetupStep([1, 2, 3, 4, 5, 6]).slug,
      "documents",
    );
  });

  it("fails closed for unknown slugs and maps document routes explicitly", () => {
    assert.equal(onboardingStepBySlug("admin"), null);
    assert.equal(providerOnboardingPath(PROVIDER_ONBOARDING_STEPS[6]),
      "/provider/verification?stage=documents",
    );
    assert.equal(providerOnboardingPath(PROVIDER_ONBOARDING_STEPS[7]),
      "/provider/verification?stage=review",
    );
  });

  it("exposes completed, current and incomplete progress text", () => {
    assert.equal(onboardingStepState(
      PROVIDER_ONBOARDING_STEPS[0],
      PROVIDER_ONBOARDING_STEPS[1],
      [1],
    ), "completed");
    assert.equal(onboardingStepState(
      PROVIDER_ONBOARDING_STEPS[1],
      PROVIDER_ONBOARDING_STEPS[1],
      [1],
    ), "current");
    assert.equal(onboardingStepState(
      PROVIDER_ONBOARDING_STEPS[2],
      PROVIDER_ONBOARDING_STEPS[1],
      [1],
    ), "incomplete");
  });

  it("keeps role, status, and URL-skipping checks on the server route", () => {
    const route = readFileSync(path.resolve(
      process.cwd(),
      "src/app/provider/onboarding/[step]/page.tsx",
    ), "utf8");
    assert.match(route, /requireProvider\(\)/u);
    assert.match(route, /requireVerifiedEmail/u);
    assert.match(route, /providerAccessDestination\(account\)/u);
    assert.match(route, /requestedStep\.number > firstIncomplete\.number/u);
    assert.match(route, /redirect\(providerOnboardingPath\(firstIncomplete\)\)/u);
  });
});
