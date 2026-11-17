import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {expect, it, vi} from "vitest";
vi.mock("next/navigation", () => ({usePathname: () => "/admin/reports/demand"}));
import {MobileNavigation} from "@/components/layout/mobile-navigation";
import {NavigationDisclosure} from "@/components/layout/navigation-disclosure";
import {getRoleNavigation} from "@/components/layout/navigation";
const reports=getRoleNavigation("admin").find((item) => item.kind==="group" && item.label==="Reports");
if (!reports || reports.kind!=="group") throw new Error("Reports submenu missing");
it("uses a non-link Reports label and four expandable module links", async () => {
  const user=userEvent.setup();
  render(<ul><NavigationDisclosure item={reports} pathname="/admin" /></ul>);
  expect(screen.queryByRole("link",{name:"Reports"})).not.toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Reports"})).toHaveAttribute("aria-expanded","false");
  await user.click(screen.getByRole("button",{name:"Reports"}));
  expect(screen.getAllByRole("link")).toHaveLength(4);
  expect(screen.getByRole("link",{name:"Sales & Commission"})).toHaveAttribute("href","/admin/reports/sales");
  await user.click(screen.getByRole("button",{name:"Reports"}));
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
it("opens the current report group and highlights its selected module", () => {
  render(<ul><NavigationDisclosure item={reports} pathname="/admin/reports/demand" /></ul>);
  expect(screen.getByRole("button",{name:"Reports"})).toHaveAttribute("aria-expanded","true");
  expect(screen.getByRole("link",{name:"Event Types & Demand"})).toHaveAttribute("aria-current","page");
});
it("expands the sidebar when its collapsed Reports icon is clicked", async () => {
  const expand=vi.fn();
  render(<ul><NavigationDisclosure item={reports} pathname="/admin" collapsed onExpand={expand} /></ul>);
  await userEvent.setup().click(screen.getByRole("button",{name:"Reports"}));
  expect(expand).toHaveBeenCalledOnce();
});

it("keeps report submodules available from the admin mobile drawer", async () => {
  render(<MobileNavigation role="admin" />);
  await userEvent.setup().click(screen.getByRole("button",{name:"More admin navigation"}));
  expect(screen.getByRole("link",{name:"Event Types & Demand"})).toHaveAttribute("aria-current","page");
  expect(screen.getByRole("button",{name:"Reports"})).toHaveAttribute("aria-expanded","true");
});
