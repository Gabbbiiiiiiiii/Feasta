import {useState} from "react";
import {fireEvent, render, screen, within} from "@testing-library/react";
import {expect, it, vi} from "vitest";

import {ServicePortfolioFields, type PortfolioDraftPhoto} from "@/app/provider/services/service-portfolio-fields";

it("adds multiple photos, reorders them, and keeps the selected cover by ID", () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn(() => "blob:portfolio-test");
  URL.revokeObjectURL = vi.fn();
  function Editor() {
    const [photos, setPhotos] = useState<PortfolioDraftPhoto[]>([]);
    const [cover, setCover] = useState<string | null>(null);
    return <ServicePortfolioFields photos={photos} coverAssetId={cover} disabled={false}
      onChange={(next, nextCover) => {setPhotos(next); setCover(nextCover);}} />;
  }

  const view = render(<Editor />);
  try {
    fireEvent.change(screen.getByLabelText(/choose or drop up to 20 photos/i), {target: {files: [
      new File(["portrait"], "portrait.jpg", {type: "image/jpeg"}),
      new File(["dance"], "dance.jpg", {type: "image/jpeg"}),
    ]}});
    const descriptions = screen.getAllByRole("textbox", {name: "Photo description"});
    fireEvent.change(descriptions[0], {target: {value: "Debut portrait"}});
    fireEvent.change(descriptions[1], {target: {value: "First dance"}});
    const second = screen.getByRole("group", {name: "Photo 2"});
    fireEvent.click(within(second).getByRole("button", {name: "Set photo 2 as cover"}));
    fireEvent.click(within(second).getByRole("button", {name: "Move photo 2 earlier"}));
    const cover = screen.getByRole("group", {name: "Photo 1"});
    expect(within(cover).getByDisplayValue("First dance")).toBeDefined();
    expect(within(cover).getByText("Cover photo")).toBeVisible();
    expect(within(cover).getByRole("button", {name: "Move photo 1 earlier"})).toBeDisabled();
    fireEvent.click(within(cover).getByRole("button", {name: "Remove photo 1"}));
    expect(screen.getByText("Cover photo")).toBeVisible();
    expect(screen.queryByRole("group", {name: "Gallery order"})).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Debut portrait")).toBeDefined();
  } finally {
    view.unmount();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});
