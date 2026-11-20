import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {CustomerEventAddressMap} from "@/components/customer/bookings/customer-event-address-map";
import {ProviderBusinessLocationMap} from "@/components/provider/provider-business-location-map";

const mocks = vi.hoisted(() => ({reverse: vi.fn(), loaderFails: false, click: null as null | ((event: unknown) => void)}));
vi.mock("@/lib/customer/planning/event-venue-client", () => ({reverseGeocodeEventVenue: mocks.reverse}));
vi.mock("@googlemaps/js-api-loader", () => ({
  setOptions: vi.fn(),
  importLibrary: async () => {
    if (mocks.loaderFails) throw new Error("Maps unavailable");
    return ({
    Map: class {
      addListener(_name: string, callback: (event: unknown) => void) {mocks.click = callback; return {remove: vi.fn()};}
      setCenter() {}
      setZoom() {}
    },
    Marker: class {setMap() {} setPosition() {}},
    });
  },
}));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY", "mock-key");
  vi.stubGlobal("google", {maps: {MapTypeId: {}, MapTypeControlStyle: {}, SymbolPath: {}, event: {trigger: vi.fn()}}});
  mocks.reverse.mockReset();
  mocks.click = null;
  mocks.loaderFails = false;
});
afterEach(() => {vi.unstubAllEnvs(); vi.unstubAllGlobals();});

it("preserves manual entry when map configuration is missing and allows cancel", async () => {
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY", "");
  const cancel = vi.fn();
  render(<CustomerEventAddressMap coordinates={null} onConfirm={vi.fn()} onCancel={cancel} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Enter your complete event address manually");
  expect(screen.getByRole("button", {name: "Confirm this location"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button", {name: "Cancel"}));
  expect(cancel).toHaveBeenCalledOnce();
});

it("only requests location on click and handles permission denial", async () => {
  const locate = vi.fn((_success, failure) => failure({code: 1}));
  vi.stubGlobal("navigator", {geolocation: {getCurrentPosition: locate}});
  render(<CustomerEventAddressMap coordinates={null} onConfirm={vi.fn()} onCancel={vi.fn()} />);
  const button = screen.getByRole("button", {name: "Use my location"});
  await waitFor(() => expect(button).toBeEnabled());
  expect(locate).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(locate).toHaveBeenCalledOnce();
  expect(screen.getByRole("alert")).toHaveTextContent("Location permission was denied");
});

it("resolves adjustable map pins and confirms the returned address", async () => {
  const location = {address: "Venue", city: "Ormoc", province: "Leyte", latitude: 11, longitude: 124};
  mocks.reverse.mockResolvedValue(location);
  const confirm = vi.fn();
  render(<CustomerEventAddressMap coordinates={null} onConfirm={confirm} onCancel={vi.fn()} />);
  await waitFor(() => expect(mocks.click).not.toBeNull());
  act(() => mocks.click?.({latLng: {lat: () => 11, lng: () => 124}}));
  await waitFor(() => expect(screen.getByText("Venue")).toBeVisible());
  fireEvent.click(screen.getByRole("button", {name: "Confirm this location"}));
  expect(confirm).toHaveBeenCalledWith(location);
});

it("keeps confirmation disabled after synchronous App Check or reverse geocoding failure", async () => {
  mocks.reverse.mockImplementation(() => {throw new Error("App Check unavailable. Enter your address manually.");});
  const confirm = vi.fn();
  render(<CustomerEventAddressMap coordinates={{latitude: 11, longitude: 124}} onConfirm={confirm} onCancel={vi.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("App Check unavailable");
  expect(screen.getByRole("button", {name: "Confirm this location"})).toBeDisabled();
  expect(confirm).not.toHaveBeenCalled();
});

it("preserves provider labels and default fallback", async () => {
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY", "");
  render(<ProviderBusinessLocationMap initialCoordinates={null} disabled={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
  expect(screen.getByLabelText("Adjust business location map")).toBeInTheDocument();
  expect(screen.getByRole("button", {name: "Locate me"})).toBeInTheDocument();
  expect(await screen.findByRole("alert")).toHaveTextContent("Search for your address instead.");
});

it("shows a manual fallback when the Maps SDK cannot load", async () => {
  mocks.loaderFails = true;
  render(<CustomerEventAddressMap coordinates={null} onConfirm={vi.fn()} onCancel={vi.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("The map could not be loaded. Enter your complete event address manually instead.");
  expect(screen.getByRole("button", {name: "Confirm this location"})).toBeDisabled();
});
