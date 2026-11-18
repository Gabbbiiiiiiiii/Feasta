import {render, screen} from "@testing-library/react";
import {expect, it, vi} from "vitest";
import {ProviderServiceForm} from "@/app/provider/services/provider-service-form";
vi.mock("@/lib/provider/provider-service-client", () => ({createProviderService: vi.fn(), updateProviderService: vi.fn()}));
vi.mock("@/lib/provider/provider-media-client", () => ({deleteProviderServiceImage: vi.fn(), uploadProviderServiceImage: vi.fn(), uploadServicePortfolioPhoto: vi.fn()}));
it.each(["photographer", "makeup_artist"])("places name validation beside the %s input and scopes the introduction", (category) => {
  render(<ProviderServiceForm serviceCategories={[category]} serviceCategoryOptions={[{code: category, name: category, serviceType: "addon", status: "active"}]} onSaved={vi.fn()} onCancel={vi.fn()} isFreelancer />);
  const name = screen.getByRole("textbox", {name: category === "photographer" ? /Package name/ : /Service name/});
  expect(name).toHaveAttribute("aria-invalid", "true");
  const nameError = "Package name must contain 3 to 80 characters.";
  expect(name).toHaveAccessibleDescription(nameError);
  expect(screen.getAllByText(nameError)).toHaveLength(1);
  expect(screen.getByText("Show Your Work")).toBeInTheDocument();
  if (category === "photographer") expect(screen.queryByText(/Add your service details, what's included, and how customers will receive their photos or videos/)).not.toBeInTheDocument();
  else expect(screen.queryByText(/how customers will receive their photos or videos/)).not.toBeInTheDocument();
});
