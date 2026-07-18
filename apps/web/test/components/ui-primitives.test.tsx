import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";

import {EmptyState, ErrorState} from "@/components/feedback/states";
import {LoadingSkeleton} from "@/components/feedback/loading";
import {FormField} from "@/components/forms/form-field";
import {PasswordInput} from "@/components/forms/password-input";
import {SearchInput} from "@/components/forms/search-input";
import {ContentContainer} from "@/components/layout/content-container";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {ImagePlaceholder} from "@/components/shared/image-placeholder";
import {PriceDisplay} from "@/components/shared/price-display";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

describe("Button", () => {
  it("renders visual variants and invokes an enabled action", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <>
        <Button onClick={onClick}>Book now</Button>
        <Button variant="secondary">Back</Button>
        <Button variant="destructive">Delete</Button>
      </>,
    );
    expect(screen.getByRole("button", {name: "Book now"})).toHaveClass("bg-primary");
    expect(screen.getByRole("button", {name: "Back"})).toHaveClass("border-input");
    expect(screen.getByRole("button", {name: "Delete"})).toHaveClass("bg-destructive");
    await user.click(screen.getByRole("button", {name: "Book now"}));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disables actions while loading and announces its loading label", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button loading loadingLabel="Saving" onClick={onClick}>Save</Button>);
    const button = screen.getByRole("button", {name: "Saving"});
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not invoke an explicitly disabled action", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Unavailable</Button>);
    const button = screen.getByRole("button", {name: "Unavailable"});
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("forms", () => {
  it("links label, description, required state, and error to its input", () => {
    render(
      <FormField
        label="Email address"
        description="We will send booking updates here."
        error="Enter a valid email address."
        required
      >
        <Input type="email" autoComplete="email" />
      </FormField>,
    );
    const input = screen.getByLabelText(/Email address/);
    const error = screen.getByRole("alert");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain(error.id);
    expect(input).toHaveAttribute("autocomplete", "email");
  });

  it("supports search entry and a keyboard-accessible clear action", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<SearchInput aria-label="Search providers" onClear={onClear} />);
    const search = screen.getByRole("searchbox", {name: "Search providers"});
    await user.type(search, "catering");
    expect(search).toHaveValue("catering");
    await user.click(screen.getByRole("button", {name: "Clear search"}));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("toggles password visibility with an accessible control", async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="Password" autoComplete="current-password" />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", {name: "Show password"}));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", {name: "Hide password"})).toBeVisible();
  });
});

describe("ConfirmationDialog", () => {
  it("traps focus and closes with Escape", async () => {
    const user = userEvent.setup();
    render(
      <ConfirmationDialog
        title="Remove provider?"
        description="This removes the provider from your favorites."
        onConfirm={() => undefined}
        trigger={<Button>Open confirmation</Button>}
      />,
    );
    await user.click(screen.getByRole("button", {name: "Open confirmation"}));
    const dialog = screen.getByRole("dialog", {name: "Remove provider?"});
    expect(dialog).toBeVisible();
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Open confirmation"})).toHaveFocus();
  });
});

describe("feedback and formatting", () => {
  it("renders text and semantics for a status badge", () => {
    render(<StatusBadge status="under_review" />);
    expect(screen.getByText("Under review")).toBeVisible();
    expect(screen.getByLabelText("Status: Under review")).toBeVisible();
  });

  it("renders skeleton, empty action, and error retry", async () => {
    const user = userEvent.setup();
    const emptyAction = vi.fn();
    const retry = vi.fn();
    render(
      <>
        <LoadingSkeleton label="Loading providers" className="h-20" />
        <EmptyState title="No providers" actionLabel="Clear filters" onAction={emptyAction} />
        <ErrorState title="Could not load" onAction={retry} />
      </>,
    );
    expect(screen.getByRole("status", {name: "Loading providers"})).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Clear filters"}));
    await user.click(screen.getByRole("button", {name: "Try again"}));
    expect(emptyAction).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledOnce();
  });

  it("handles large prices, missing images, and long content", () => {
    const longTitle = "A very long provider result message that must wrap without losing any actions or meaning";
    render(
      <ContentContainer data-testid="container">
        <PriceDisplay amount={123456789.5} originalPrice={150000000} discountPercent={18} suffix="per event" />
        <ImagePlaceholder label="Provider cover unavailable" />
        <EmptyState title={longTitle} description={longTitle.repeat(2)} />
      </ContentContainer>,
    );
    expect(screen.getByLabelText(/Price:/)).toHaveTextContent(/123,456,789/);
    expect(screen.getByRole("img", {name: "Provider cover unavailable"})).toBeVisible();
    expect(screen.getByTestId("container")).toHaveClass("max-w-7xl");
    expect(screen.getByRole("heading", {name: longTitle})).toBeVisible();
  });
});
