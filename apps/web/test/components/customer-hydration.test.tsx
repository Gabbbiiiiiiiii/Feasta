import {afterEach, describe, expect, it, vi} from "vitest";
import {StartYourEventForm} from "@/components/landing/start-your-event-form";
import {MarketplaceSearch} from "@/components/customer/discovery/marketplace-search";
import {EventFinder} from "@/components/customer/layout/event-finder";
import {CustomerAuthProvider} from "@/components/customer/layout/customer-auth-provider";
import {FirebaseBrowserInitializer} from "@/components/providers/firebase-browser-initializer";
import {assertHydration} from "../helpers/assert-hydration";

const mocks = vi.hoisted(() => ({initialize: vi.fn()}));
vi.mock("next/navigation", () => ({useRouter: () => ({push: vi.fn()})}));
vi.mock("@/lib/firebase/client", () => ({initializeBrowserFirebase: mocks.initialize}));
vi.mock("@/lib/customer/planning/event-venue-client", () => ({
  searchEventVenues: vi.fn(), getEventVenueDetails: vi.fn(),
}));

afterEach(() => vi.useRealTimers());

describe("customer hydration boundaries", () => {
  it.each([
    ["Start Your Event", <StartYourEventForm key="start" />],
    ["marketplace planning search", <MarketplaceSearch key="search" />],
    ["Event Finder", <EventFinder key="finder" query="eventDate=2026-09-05" onFind={() => {}} />],
  ] as const)("hydrates %s across Manila midnight before setting the date minimum", async (_name, tree) => {
    vi.useFakeTimers({toFake: ["Date"]});
    vi.setSystemTime(new Date("2026-09-05T15:59:59Z"));
    await assertHydration(tree, (container) => {
      expect(container.querySelector('input[type="date"]')).not.toHaveAttribute("min");
      vi.setSystemTime(new Date("2026-09-05T16:00:01Z"));
    }, (container) => {
      expect(container.querySelector('input[type="date"]')).toHaveAttribute("min", "2026-09-06");
    });
  });

  it("initializes browser Firebase only after commit without changing the guest auth tree", async () => {
    mocks.initialize.mockClear();
    await assertHydration(
      <CustomerAuthProvider><FirebaseBrowserInitializer /><p>Browse FEASTA</p></CustomerAuthProvider>,
      (container) => {
        expect(mocks.initialize).not.toHaveBeenCalled();
        expect(container).toHaveTextContent("Browse FEASTA");
        expect(container.querySelector('[role="dialog"]')).toBeNull();
      },
      (container) => {
        expect(mocks.initialize).toHaveBeenCalledTimes(1);
        expect(container).toHaveTextContent("Browse FEASTA");
        expect(container.querySelector('[role="dialog"]')).toBeNull();
      },
    );
  });
});
