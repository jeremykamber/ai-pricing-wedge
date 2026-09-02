import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DebateSidebar } from "../DebateSidebar";
import { useDebateStore } from "@/ui/stores/debateStore";
import type { Persona } from "@/domain/entities/Persona";

const mockPersona: Persona = {
  id: "p1", name: "A", age: 30,
  occupation: "CTO", educationLevel: "MSc",
  interests: [], goals: [],
  conscientiousness: 50, neuroticism: 50, openness: 50,
  extraversion: 50, agreeableness: 50,
  values: [], fears: [],
  communicationStyle: "", decisionStyle: "",
  pricingSensitivity: 50, typicalBudget: "",
};

describe("DebateSidebar", () => {
  beforeEach(() => {
    useDebateStore.setState({
      debates: [],
      activeDebateId: null,
      isStreaming: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows empty state when no debates exist", () => {
    const onNewDebate = vi.fn();
    render(<DebateSidebar onNewDebate={onNewDebate} />);
    expect(screen.getByText(/No debates yet/)).toBeTruthy();
  });

  it("lists all debates with proposal preview", () => {
    useDebateStore.getState().addDebate({
      id: "d1",
      proposal: "Raise prices 60%",
      participants: [mockPersona],
      messages: [],
      currentRound: 0,
      totalRounds: 3,
      status: "setup",
      createdAt: new Date().toISOString(),
    });
    useDebateStore.getState().addDebate({
      id: "d2",
      proposal: "Ship Q2 vs Q3",
      participants: [mockPersona],
      messages: [],
      currentRound: 1,
      totalRounds: 3,
      status: "in_progress",
      createdAt: new Date().toISOString(),
    });

    render(<DebateSidebar onNewDebate={vi.fn()} />);
    expect(screen.getByText(/Raise prices/)).toBeTruthy();
    expect(screen.getByText(/Ship Q2/)).toBeTruthy();
  });

  it("calls onNewDebate when button clicked", () => {
    const onNewDebate = vi.fn();
    render(<DebateSidebar onNewDebate={onNewDebate} />);
    const btn = screen.getByText(/New Debate/);
    fireEvent.click(btn);
    expect(onNewDebate).toHaveBeenCalledTimes(1);
  });

  it("shows status badges", () => {
    useDebateStore.getState().addDebate({
      id: "d1",
      proposal: "Test",
      participants: [mockPersona],
      messages: [],
      currentRound: 1,
      totalRounds: 3,
      status: "in_progress",
      createdAt: new Date().toISOString(),
    });

    render(<DebateSidebar onNewDebate={vi.fn()} />);
    expect(screen.getByText(/In Progress/)).toBeTruthy();
  });
});
