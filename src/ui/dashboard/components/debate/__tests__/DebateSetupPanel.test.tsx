import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DebateSetupPanel } from "../DebateSetupPanel";

describe("DebateSetupPanel", () => {
  afterEach(() => cleanup());

  const mockPersonas = [
    { id: "p1", name: "Alice Chen", occupation: "CTO" },
    { id: "p2", name: "Bob Martinez", occupation: "Product Manager" },
    { id: "p3", name: "Casey Kim", occupation: "VP Engineering" },
  ];

  it("renders the setup form", () => {
    render(
      <DebateSetupPanel
        availablePersonas={mockPersonas as any}
        onStart={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("New Debate")).toBeTruthy();
    expect(screen.getByPlaceholderText(/What proposal/)).toBeTruthy();
    expect(screen.getByText(/Start Debate/)).toBeTruthy();
  });

  it("lists available personas as checkable items", () => {
    render(
      <DebateSetupPanel
        availablePersonas={mockPersonas as any}
        onStart={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Alice Chen")).toBeTruthy();
    expect(screen.getByText("Bob Martinez")).toBeTruthy();
    expect(screen.getByText("Casey Kim")).toBeTruthy();
  });

  it("calls onStart with config when form is submitted", () => {
    const onStart = vi.fn();
    render(
      <DebateSetupPanel
        availablePersonas={mockPersonas as any}
        onStart={onStart}
        onCancel={vi.fn()}
      />,
    );

    // Type a proposal
    const input = screen.getByPlaceholderText(/What proposal/);
    fireEvent.change(input, { target: { value: "Raise prices 60%" } });

    // Select two personas (need at least 2)
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    // Submit
    const submitBtn = screen.getByText(/Start Debate/);
    fireEvent.click(submitBtn);

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        proposal: "Raise prices 60%",
        totalRounds: 3,
      }),
    );
  });

  it("disables submit without proposal or personas", () => {
    render(
      <DebateSetupPanel
        availablePersonas={mockPersonas as any}
        onStart={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const submitBtn = screen.getByText(/Start Debate/);
    expect(submitBtn.hasAttribute("disabled")).toBe(true);
  });
});
