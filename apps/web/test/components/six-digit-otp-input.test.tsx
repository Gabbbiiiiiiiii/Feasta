import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {useState} from "react";
import {describe, expect, it, vi} from "vitest";

import {SixDigitOtpInput} from "@/components/auth/six-digit-otp-input";

function OtpHarness({
  initialValue = "",
  disabled = false,
  invalid = false,
}: {
  initialValue?: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <>
      <SixDigitOtpInput
        value={value}
        onChange={setValue}
        disabled={disabled}
        invalid={invalid}
        errorId={invalid ? "otp-error" : undefined}
      />
      <output data-testid="canonical-otp">{value}</output>
      {invalid ? <p id="otp-error">The verification code is incorrect.</p> : null}
    </>
  );
}

describe("SixDigitOtpInput", () => {
  it("renders exactly six accessible, responsive numeric cells", () => {
    render(<OtpHarness />);
    const group = screen.getByRole("group", {name: /verification code/i});
    const cells = screen.getAllByRole("textbox", {name: /digit \d of 6/i});

    expect(cells).toHaveLength(6);
    expect(cells[0]).toHaveAttribute("inputmode", "numeric");
    expect(cells[0]).toHaveAttribute("pattern", "[0-9]*");
    expect(cells[0]).toHaveAttribute("maxlength", "1");
    expect(cells[0]).toHaveAttribute("autocomplete", "one-time-code");
    expect(cells[1]).toHaveAttribute("autocomplete", "off");
    expect(group.querySelector("[data-testid='provider-registration-otp-cells']"))
      .toHaveClass("w-full", "max-w-[376px]", "grid-cols-6");
    for (const cell of cells) expect(cell).toHaveClass("min-w-0", "w-full");
  });

  it("accepts digits only, advances focus, and exposes one canonical string", async () => {
    const user = userEvent.setup();
    render(<OtpHarness />);
    const cells = screen.getAllByRole("textbox", {name: /digit \d of 6/i});

    await user.type(cells[0], "a1");
    expect(cells[0]).toHaveValue("1");
    expect(cells[1]).toHaveFocus();
    await user.type(cells[1], "-2");
    expect(screen.getByTestId("canonical-otp")).toHaveTextContent("12");
    expect(cells[2]).toHaveFocus();
  });

  it("supports backspace and left/right arrow navigation", async () => {
    const user = userEvent.setup();
    render(<OtpHarness initialValue="12" />);
    const cells = screen.getAllByRole("textbox", {name: /digit \d of 6/i});

    cells[1].focus();
    await user.keyboard("{Backspace}");
    expect(screen.getByTestId("canonical-otp")).toHaveTextContent("1");
    expect(cells[1]).toHaveFocus();
    await user.keyboard("{Backspace}");
    expect(screen.getByTestId("canonical-otp")).toBeEmptyDOMElement();
    expect(cells[0]).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(cells[1]).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(cells[0]).toHaveFocus();
  });

  it("normalizes full paste, fills all cells, and ignores excess digits", async () => {
    const user = userEvent.setup();
    render(<OtpHarness />);
    const cells = screen.getAllByRole("textbox", {name: /digit \d of 6/i});

    cells[3].focus();
    await user.paste("12-34 56789");
    expect(screen.getByTestId("canonical-otp")).toHaveTextContent("123456");
    expect(cells.map((cell) => (cell as HTMLInputElement).value))
      .toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(cells[5]).toHaveFocus();
  });

  it("fills a partial paste from the active cell", async () => {
    const user = userEvent.setup();
    render(<OtpHarness initialValue="1" />);
    const cells = screen.getAllByRole("textbox", {name: /digit \d of 6/i});

    cells[1].focus();
    await user.paste("2-3");
    expect(screen.getByTestId("canonical-otp")).toHaveTextContent("123");
    expect(cells[3]).toHaveFocus();
  });

  it("disables every cell and associates a non-color error cue", () => {
    render(<OtpHarness initialValue="123456" disabled invalid />);
    const group = screen.getByRole("group", {name: /verification code/i});
    const cells = screen.getAllByRole("textbox", {name: /digit \d of 6/i});

    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/check the verification error below/i))
      .toBeInTheDocument();
    for (const [index, cell] of cells.entries()) {
      expect(cell).toBeDisabled();
      expect(cell).toHaveAttribute("aria-describedby", "otp-error");
      expect(cell).toHaveValue(String(index + 1));
    }
  });

  it("never persists OTP state in browser storage", () => {
    const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");
    render(<OtpHarness initialValue="123456" />);
    expect(localStorageSpy).not.toHaveBeenCalled();
    localStorageSpy.mockRestore();
  });
});
