import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";

import {DataTable, type DataTableColumn} from "@/components/data";
import {ApplicationEmptyState, ApplicationErrorState, FullPageLoading, ListLoadingSkeleton, SectionLoading} from "@/components/feedback/application-states";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {Button} from "@/components/ui/button";

describe("standardized application states", () => {
  it("uses actionable, non-technical error messages", () => {
    const retry = vi.fn();
    const {rerender} = render(<ApplicationErrorState kind="connectivity" onRetry={retry} />);
    expect(screen.getByRole("heading", {name: "You appear to be offline"})).toBeVisible();
    expect(screen.queryByText(/stack|exception|firebase/i)).not.toBeInTheDocument();
    rerender(<ApplicationErrorState kind="permission-denied" />);
    expect(screen.getByRole("heading", {name: "You do not have access"})).toBeVisible();
    rerender(<ApplicationErrorState kind="session-expired" onRetry={retry} />);
    expect(screen.getByRole("button", {name: "Sign in"})).toBeVisible();
  });

  it("provides consistent empty messages for managed records", () => {
    const {rerender} = render(<ApplicationEmptyState kind="bookings" />);
    expect(screen.getByRole("heading", {name: "No bookings yet"})).toBeVisible();
    rerender(<ApplicationEmptyState kind="verification-submissions" />);
    expect(screen.getByRole("heading", {name: "No verification submissions"})).toBeVisible();
    rerender(<ApplicationEmptyState kind="payments" />);
    expect(screen.getByRole("heading", {name: "No payments yet"})).toBeVisible();
  });

  it("renders full-page, section, and layout-matched list loading states", () => {
    render(<><FullPageLoading label="Loading account" /><SectionLoading label="Loading report" /><ListLoadingSkeleton count={2} /></>);
    expect(screen.getByRole("status", {name: "Loading account"})).toBeVisible();
    expect(screen.getByRole("status", {name: "Loading report"})).toBeVisible();
    expect(screen.getByLabelText("Loading list").children).toHaveLength(2);
  });

  it("does not show an empty table while it is loading", () => {
    type Row = {id: string};
    const columns: DataTableColumn<Row>[] = [{id: "id", header: "ID", cell: (row) => row.id}];
    render(<DataTable columns={columns} rows={[]} getRowId={(row) => row.id} caption="Bookings" loading emptyKind="bookings" />);
    expect(screen.getByLabelText("Loading Bookings")).toBeVisible();
    expect(screen.queryByText("No bookings yet")).not.toBeInTheDocument();
  });

  it("prevents duplicate confirmation submissions while progress is pending", async () => {
    const user = userEvent.setup();
    let finish: (() => void) | undefined;
    const confirm = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<ConfirmationDialog title="Cancel booking?" description="This will cancel the booking." destructive onConfirm={confirm} trigger={<Button>Cancel booking</Button>} />);
    await user.click(screen.getByRole("button", {name: "Cancel booking"}));
    await user.click(screen.getByRole("button", {name: "Confirm"}));
    expect(screen.getByRole("button", {name: "Submitting"})).toBeDisabled();
    await user.click(screen.getByRole("button", {name: "Submitting"}));
    expect(confirm).toHaveBeenCalledOnce();
    finish?.();
    await waitFor(() => expect(screen.getByRole("button", {name: "Confirm"})).toBeEnabled());
  });
});
