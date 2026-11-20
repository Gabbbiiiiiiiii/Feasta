import {expect, it, vi} from "vitest";
import {createProviderPackage, updateProviderPackage, listProviderPackages} from "@/lib/provider/provider-package-client";
import {parsePackageDishes} from "@/lib/provider/package-food-inclusions";

const mocks = vi.hoisted(() => ({call: vi.fn(), getDocs: vi.fn(), where: vi.fn()}));
vi.mock("@/lib/firebase/client", () => ({auth: {authStateReady: async () => {}, currentUser: {uid: "owner"}}, db: {}, functions: {}}));
vi.mock("@/lib/provider/provider-package-v2-client", () => ({packageV2Enabled: false, packageV2PublicationEnabled: false}));
vi.mock("firebase/functions", () => ({httpsCallable: (_: unknown, name: string) => (input: unknown) => mocks.call(name, input)}));
vi.mock("firebase/firestore", () => ({collection: vi.fn(), query: vi.fn(), orderBy: vi.fn(), where: mocks.where, getDocs: mocks.getDocs}));

it("sends the exact bundle draft on create/update and reads a provider-scoped record without losing categorized dishes", async () => {
  const input = {
    name: "Busog Na Set - Bilao Package", description: "Eight dishes for a birthday gathering.",
    offerStructure: "fixed" as const, packageStyle: "Bilao Package", pricingModel: "per_bundle" as const,
    eventType: "birthday", serviceCategoryCode: "catering_service", price: 1850,
    minimumGuests: 8, maximumGuests: 10, paymentPolicy: "full_payment" as const, depositPercentage: 100,
    serviceOptions: {drop_off: {price: 1850, includedServices: ["Delivery"]}}, themeOptions: [],
    imageUrl: "https://example.com/cover.png", imageUrls: ["https://example.com/cover.png"],
    foodInclusions: ["Pasta/Noodles: Bam-e guisado", "Pork: Breaded porkchop", "Fish/Seafood: Calamari",
      "Fish/Seafood: Boneless bangus", "Appetizers: Shanghai rolls", "Chicken: Buffalo wings",
      "Chicken: Buttered chicken", "Desserts: 2 mango tapioca desserts"],
    decorInclusions: [], furnitureInclusions: [], serviceInclusions: [],
  };
  mocks.call.mockResolvedValue({data: {success: true, packageId: "bilao", status: "draft"}});
  await createProviderPackage(input);
  expect(mocks.call).toHaveBeenLastCalledWith("createProviderPackage", input);
  await updateProviderPackage("bilao", input);
  expect(mocks.call).toHaveBeenLastCalledWith("updateProviderPackage", {...input, packageId: "bilao"});
  // Simulated server readback: no Firebase or media writes.
  mocks.getDocs.mockResolvedValue({docs: [{id: "bilao", data: () => ({...input, providerId: "provider",
    status: "draft", isActive: false, isPublished: false, providerPubliclyVisible: false,
    downPaymentPercentage: 100, balanceDueDaysBeforeEvent: null})}]});
  const [saved] = await listProviderPackages("provider");
  expect(mocks.where).toHaveBeenCalledWith("providerId", "==", "provider");
  expect(saved).toMatchObject(input);
  expect(parsePackageDishes(saved.foodInclusions)).toHaveLength(8);
  expect(parsePackageDishes(saved.foodInclusions)[7]).toMatchObject({category: "Desserts", name: "2 mango tapioca desserts"});
});
