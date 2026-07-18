import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import CustomerProvidersPage from "@/app/customer/providers/page";
import {roleNavigation} from "@/components/layout/navigation";

describe("representative application screens", () => {
  it("uses the shared discovery controls and an honest empty result state", () => {
    render(<CustomerProvidersPage />);

    expect(screen.getByRole("heading", {level: 1, name: "Find event providers"})).toBeInTheDocument();
    expect(screen.getByRole("searchbox", {name: "Search all records"})).toBeInTheDocument();
    expect(screen.getByRole("combobox", {name: "Provider service type"})).toBeInTheDocument();
    expect(screen.getByText("No providers found")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", {name: "Search all records"}), {target: {value: "venue"}});
    fireEvent.submit(screen.getByRole("search"));

    expect(screen.getByText(/Active filters: Search: venue/)).toBeInTheDocument();
    expect(screen.getByText("No matching results")).toBeInTheDocument();
  });

  it("exposes provider verification within the protected provider shell", () => {
    expect(roleNavigation.provider).toEqual(expect.arrayContaining([
      expect.objectContaining({label: "Verification", href: "/provider/verification"}),
    ]));
  });
});
