import {describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  loading: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: mocks,
  Toaster: () => null,
}));

import {feastaToast} from "@/components/feedback/toast";

describe("feastaToast", () => {
  it("delegates semantic toast types to the shared toast host", () => {
    feastaToast.success("Saved");
    feastaToast.error("Could not save");
    expect(mocks.success).toHaveBeenCalledWith("Saved");
    expect(mocks.error).toHaveBeenCalledWith("Could not save");
  });
});
