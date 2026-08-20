import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

// Stable mocks at module level
const mockUsePathname = vi.fn();
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: mockPush }),
}));

const mockSetActiveBatch = vi.fn();
const mockPersonaState = { batches: [], activeBatchId: null, setActiveBatch: mockSetActiveBatch };
vi.mock("@/ui/stores/personaStore", () => ({
  usePersonaStore: (selector?: (state: any) => any) =>
    selector ? selector(mockPersonaState) : mockPersonaState,
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="scroll-area">{children}</div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, className, ...props }: any) => (
    <button onClick={onClick} className={className} {...props}>{children}</button>
  ),
}));

vi.mock("lucide-react", () => ({
  UserIcon: () => <svg data-testid="user-icon" />,
  FileTextIcon: () => <svg data-testid="file-text-icon" />,
  PlayIcon: () => <svg data-testid="play-icon" />,
  LayersIcon: () => <svg data-testid="layers-icon" />,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    className,
    children,
  }: {
    href: string;
    className: string;
    children: React.ReactNode;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { Sidebar } from "../Sidebar";

function getPersonasButton(container: HTMLElement) {
  // The Personas nav item is a <button> inside the <nav>
  const buttons = container.querySelectorAll("nav button");
  for (const btn of buttons) {
    if (btn.textContent?.includes("Personas")) return btn;
  }
  throw new Error("Could not find Personas button");
}

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("highlights Personas when on /dashboard", () => {
    mockUsePathname.mockReturnValue("/dashboard");
    const { container } = render(<Sidebar />);

    const personasBtn = getPersonasButton(container);
    expect(personasBtn.className).toContain("bg-primary/10");
  });

  it("does NOT highlight Personas when on /dashboard/interviews", () => {
    mockUsePathname.mockReturnValue("/dashboard/interviews");
    const { container } = render(<Sidebar />);

    const personasBtn = getPersonasButton(container);
    expect(personasBtn.className).not.toContain("bg-primary/10");
  });

  it("does NOT highlight Personas when on /dashboard/analyses", () => {
    mockUsePathname.mockReturnValue("/dashboard/analyses");
    const { container } = render(<Sidebar />);

    const personasBtn = getPersonasButton(container);
    expect(personasBtn.className).not.toContain("bg-primary/10");
  });

  it("highlights Interviews when on /dashboard/interviews", () => {
    mockUsePathname.mockReturnValue("/dashboard/interviews");
    const { container } = render(<Sidebar />);

    const link = container.querySelector('a[href="/dashboard/interviews"]');
    expect(link).not.toBeNull();
    expect(link!.className).toContain("bg-primary/10");
  });

  it("highlights Analyses when on /dashboard/analyses", () => {
    mockUsePathname.mockReturnValue("/dashboard/analyses");
    const { container } = render(<Sidebar />);

    const link = container.querySelector('a[href="/dashboard/analyses"]');
    expect(link).not.toBeNull();
    expect(link!.className).toContain("bg-primary/10");
  });
});
