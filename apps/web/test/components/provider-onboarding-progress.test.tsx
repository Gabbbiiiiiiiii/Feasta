import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {ProviderOnboardingShell} from "@/components/provider/onboarding-shell";
import {PROVIDER_ONBOARDING_STEPS} from "@/lib/provider/onboarding";

describe("provider onboarding shell", () => {
  it("labels progress and communicates state without relying on color", () => {
    render(
      <ProviderOnboardingShell
        currentStep={PROVIDER_ONBOARDING_STEPS[2]}
        completedSteps={[1, 2]}
      >
        <p>Step content</p>
      </ProviderOnboardingShell>,
    );

    expect(screen.getByRole("heading", {
      level: 1,
      name: "Services and event capabilities",
    })).toBeInTheDocument();
    const progress = screen.getByRole("navigation", {
      name: "Provider onboarding progress",
    });
    expect(progress).toBeInTheDocument();
    expect(progress.querySelector("[aria-current='step']")).toHaveTextContent(
      "current",
    );
    expect(screen.getAllByText("completed")).toHaveLength(2);
    expect(screen.getAllByText("incomplete")).toHaveLength(5);
  });

  it("uses shared responsive grids without fixed-width overflow", () => {
    const {container} = render(
      <ProviderOnboardingShell
        currentStep={PROVIDER_ONBOARDING_STEPS[0]}
        completedSteps={[]}
      >
        <p>Responsive content</p>
      </ProviderOnboardingShell>,
    );
    expect(container.firstElementChild).toHaveClass("min-w-0");
    expect(container.innerHTML).toContain(
      "lg:grid-cols-[17rem_minmax(0,1fr)]",
    );
    expect(container.innerHTML).toContain("sm:grid-cols-2");
  });
});
