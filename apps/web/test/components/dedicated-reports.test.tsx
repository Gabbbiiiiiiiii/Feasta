import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, expect, it, vi} from "vitest";
const mocks=vi.hoisted(() => ({load:vi.fn(),export:vi.fn()}));
vi.mock("@/app/admin/reports/dedicated-actions", () => ({loadDedicatedReport:mocks.load}));
vi.mock("@/lib/admin/reports/dedicated-report-export", () => ({exportDedicatedReport:mocks.export}));
import {DedicatedReports} from "@/components/admin/reports/dedicated-reports";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue({title:"Sales results",generatedAt:"2026-11-18T00:00:00Z",generatedBy:"Test Admin",period:"Test filters",headers:["Vendor"],rows:[["Test Catering"]],note:"Ledger basis",summary:["Total: PHP 100.00"]});
});
it("renders PDF-only results and invalidates exports after filter changes", async () => {
  const user=userEvent.setup();
  render(<DedicatedReports categories={[{code:"catering_service",name:"Catering Service"}]} />);
  expect(screen.queryByRole("button",{name:/Excel/i})).not.toBeInTheDocument();
  await user.click(screen.getByRole("button",{name:"Generate report"}));
  await screen.findByText("Test Catering");
  expect(screen.getByRole("button",{name:"Download PDF"})).toBeEnabled();
  expect(screen.queryByRole("navigation",{name:"Report pages"})).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Service category"),"catering_service");
  expect(screen.getByRole("button",{name:"Download PDF"})).toBeDisabled();
  expect(screen.queryByText("Test Catering")).not.toBeInTheDocument();
});
it("uses report-specific filters and customer/vendor directory toggles", async () => {
  const user=userEvent.setup();
  const {rerender}=render(<DedicatedReports key="quality" reportType="quality" />);
  expect(screen.queryByRole("navigation",{name:"Report modules"})).not.toBeInTheDocument();
  expect(screen.getByLabelText("Rating threshold")).toBeInTheDocument();
  expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
  rerender(<DedicatedReports key="directory" reportType="directory" />);
  await user.click(screen.getByRole("button",{name:"Registered Customers"}));
  expect(screen.queryByLabelText("Service category")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button",{name:"Generate report"}));
  await waitFor(() => expect(mocks.load).toHaveBeenCalledWith(expect.objectContaining({type:"directory",directory:"customers"})));
});
