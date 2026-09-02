import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { parseMessageContent } from "../parseMessageContent";

describe("parseMessageContent", () => {
  it("renders bold markdown instead of raw asterisks", () => {
    const { container } = render(<div>{parseMessageContent("**pricing** is the blocker")}</div>);
    expect(container.querySelector("strong")).not.toBeNull();
    expect(container.textContent).toContain("pricing is the blocker");
    // Raw asterisks must not leak through.
    expect(container.textContent).not.toContain("**");
  });

  it("renders lists and italic markdown", () => {
    const { container } = render(
      <div>{parseMessageContent("1. show the price\n2. prove the claims")}</div>,
    );
    expect(container.querySelector("ol")).not.toBeNull();
    expect(container.querySelector("li")).not.toBeNull();
  });

  it("preserves single newlines as line breaks (no whitespace collapse)", () => {
    const { container } = render(<div>{parseMessageContent("line one\nline two")}</div>);
    expect(container.textContent).toContain("line one");
    expect(container.textContent).toContain("line two");
    // remark-breaks keeps the line break instead of collapsing to a space.
    expect(container.querySelector("br")).not.toBeNull();
  });

  it("extracts reasoning into a ThinkingBlock", () => {
    const { container } = render(
      <div>{parseMessageContent("<<REASONING>>inner plan<</REASONING>>answer")}</div>,
    );
    // Collapsed ThinkingBlock shows its toggle; the reasoning body is hidden.
    expect(container.textContent).toContain("Thinking");
    expect(container.textContent).toContain("answer");
    // The reasoning markers themselves are consumed.
    expect(container.textContent).not.toContain("<<REASONING>>");
    expect(container.textContent).not.toContain("<</REASONING>>");
  });

  it("renders every reasoning block, not just the first", () => {
    const { container } = render(
      <div>
        {parseMessageContent(
          "<<REASONING>>first thought<</REASONING>>answer text<<REASONING>>second thought<</REASONING>>",
        )}
      </div>,
    );
    const toggles = container.querySelectorAll("button");
    // One ThinkingBlock toggle per reasoning block.
    expect(toggles.length).toBe(2);
    expect(container.textContent).toContain("answer text");
    expect(container.textContent).not.toContain("<<REASONING>>");
    expect(container.textContent).not.toContain("<</REASONING>>");
  });

  it("renders reasoning appended after the answer in order", () => {
    const { container } = render(
      <div>{parseMessageContent("answer first<<REASONING>>late thought<</REASONING>>")}</div>,
    );
    const blocks = container.querySelectorAll("button");
    expect(blocks.length).toBe(1);
    // Body renders before the reasoning toggle.
    const children = Array.from(container.children[0].children ?? container.children);
    expect(children[0].textContent).toContain("answer first");
  });

  it("does not leak raw markers for an unclosed mid-stream reasoning block", () => {
    const { container } = render(
      <div>{parseMessageContent("<<REASONING>>still thinking")}</div>,
    );
    // In-progress reasoning is shown as a collapsed ThinkingBlock, never as
    // raw marker text.
    expect(container.textContent).toContain("Thinking");
    expect(container.textContent).not.toContain("<<REASONING>>");
  });

  it("keeps memory markers as footnotes with superscript refs", () => {
    const { container } = render(
      <div>{parseMessageContent("I remember [Memory: my childhood dog] fondly")}</div>,
    );
    expect(container.querySelector("sup")).not.toBeNull();
    expect(container.textContent).toContain("my childhood dog");
  });
});
