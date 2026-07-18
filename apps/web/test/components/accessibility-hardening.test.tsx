import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/providers",
  useRouter: () => ({replace: vi.fn(), refresh: vi.fn()}),
}));
vi.mock("@/lib/auth/client-session", () => ({logoutWebSession: vi.fn().mockResolvedValue(undefined)}));

import {DataTable, type DataTableColumn} from "@/components/data";
import {ChartContainer} from "@/components/data/chart-container";
import {ApplicationErrorState} from "@/components/feedback/application-states";
import {FormField} from "@/components/forms/form-field";
import {ApplicationShell} from "@/components/layout/application-shell";
import {PageHeading} from "@/components/layout/page-heading";
import {ImagePlaceholder} from "@/components/shared/image-placeholder";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {runBasicAccessibilityAudit} from "../accessibility/basic-a11y";

describe("basic automated accessibility audit", () => {
  const contrastRatio = (first: string, second: string) => {
    const luminance = (hex: string) => {
      const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
      const linear = channels.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };

  it("passes a representative authenticated management page", () => {
    type Row = {id: string; name: string};
    const columns: DataTableColumn<Row>[] = [{id: "name", header: "Provider", cell: (row) => row.name}];
    const {container} = render(
      <ApplicationShell role="admin" accountLabel="admin@feasta.test">
        <PageHeading title="Provider management" description="Review provider submissions." />
        <FormField label="Search providers" description="Search all provider records.">
          <Input type="search" />
        </FormField>
        <ImagePlaceholder label="Provider logo unavailable" />
        <DataTable columns={columns} rows={[{id: "provider-1", name: "Sample Catering"}]} getRowId={(row) => row.id} caption="Provider results" />
        <ChartContainer title="Provider submissions" description="Submissions by month" fallbackSummary="One provider submission is shown for July.">
          <div aria-hidden="true">Visual chart</div>
        </ChartContainer>
      </ApplicationShell>,
    );
    expect(runBasicAccessibilityAudit(container)).toEqual([]);
  });

  it("keeps focus indicators and async errors programmatically available", () => {
    render(<><Button>Save changes</Button><FormField label="Business name" error="Enter a business name"><Input /></FormField><ApplicationErrorState kind="server" /></>);
    expect(screen.getByRole("button", {name: "Save changes"})).toHaveClass("focus-visible:ring-2");
    expect(screen.getByLabelText("Business name")).toHaveClass("focus-visible:ring-2");
    expect(screen.getByLabelText("Business name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert", {name: /temporarily unavailable/i})).toHaveAttribute("aria-live", "assertive");
  });

  it("supports logical keyboard order from skip link into navigation", async () => {
    const user = userEvent.setup();
    render(<ApplicationShell role="admin" accountLabel="admin@feasta.test"><PageHeading title="Dashboard" /></ApplicationShell>);
    await user.tab();
    expect(screen.getByRole("link", {name: "Skip to main content"})).toHaveFocus();
    await user.tab();
    expect(screen.getAllByRole("link", {name: /FEASTA Admin home/})[0]).toHaveFocus();
  });

  it("keeps primary semantic text pairs at WCAG AA contrast", () => {
    const pairs = [
      ["#2b211d", "#ff6333"],
      ["#6b625d", "#f8f6f3"],
      ["#b83a12", "#f8f6f3"],
      ["#166534", "#ecfdf3"],
      ["#92400e", "#fff7e6"],
      ["#b42318", "#fff1f0"],
      ["#1d4ed8", "#eff6ff"],
    ] as const;
    pairs.forEach(([foreground, background]) => expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5));
  });
});
