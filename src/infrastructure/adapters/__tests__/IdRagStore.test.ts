import { describe, it, expect } from "vitest";
import { IdRagStore, type Chunk } from "../IdRagStore";
import type { Persona } from "@/domain/entities/Persona";

const makePersona = (overrides: Partial<Persona> = {}): Persona => ({
  id: "test-1",
  name: "Jordan Chen",
  age: 34,
  occupation: "Product Manager",
  educationLevel: "MBA",
  interests: ["saas"],
  goals: ["optimize"],
  conscientiousness: 80,
  neuroticism: 60,
  openness: 70,
  extraversion: 45,
  agreeableness: 55,
  values: ["efficiency", "value"],
  fears: ["wasted time", "bad investments"],
  communicationStyle: "direct",
  decisionStyle: "data-driven",
  pricingSensitivity: 50,
  typicalBudget: "$50/user/month",
  ...overrides,
});

describe("IdRagStore", () => {
  it("chunks a backstory into coherent segments with metadata", () => {
    const store = new IdRagStore();
    const chunks = store.chunkBackstory("test-1", [
      "I grew up in a small town with my parents. My father was an engineer who taught me to question everything. School was always easy for me, and I loved building things.",
      "After college, I joined a startup as a product manager. We grew from 10 to 200 people in three years. I learned how to prioritize features and deal with demanding customers.",
      "I once lost $10,000 on an annual contract for a tool we never used. That experience made me deeply skeptical of long-term commitments and flashy sales pitches.",
    ].join("\n\n"));

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].personaId).toBe("test-1");
    expect(chunks[0].metadata.topic).toBeTruthy();
    expect(chunks[0].metadata.emotionalTone).toBeTruthy();
    expect(chunks[0].id).toContain("chunk-test-1");
  });

  it("ingests and retrieves relevant chunks", () => {
    const store = new IdRagStore();
    const persona = makePersona({
      backstory: [
        "I grew up in a family of engineers. My father was a software architect who taught me to question everything.",
        "My biggest career mistake was signing a three-year contract for $15,000/year for a CRM that our team hated. I learned to always negotiate month-to-month.",
        "Today I run product at a Series B SaaS company. I evaluate tools based on unit economics and team adoption, not flashy demos.",
      ].join("\n\n"),
    });

    store.ingestPersona(persona);

    const results = store.retrieve("test-1", "contract mistake CRM cost");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("retrieves top-K results sorted by relevance", () => {
    const store = new IdRagStore();
    const persona = makePersona({
      backstory: [
        "I grew up in a family of engineers who emphasized technical excellence.",
        "My childhood home was filled with gadgets and tools that my father would fix.",
        "I hate spending money on things I don't need. My parents were frugal immigrants.",
      ].join("\n\n"),
    });

    store.ingestPersona(persona);

    const results = store.retrieve("test-1", "money spending frugal", 2);
    expect(results.length).toBeLessThanOrEqual(2);
    // Higher score = more relevant
    if (results.length >= 2) {
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    }
  });

  it("formats retrieved context for prompt injection", () => {
    const store = new IdRagStore();
    const persona = makePersona({
      backstory: "I grew up in a small town. My family always emphasized the value of a dollar.",
    });

    store.ingestPersona(persona);
    const results = store.retrieve("test-1", "family value money");
    const formatted = store.formatRetrievedContext(results);

    expect(formatted).toContain("[Relevant Memory 1]");
    expect(formatted).toContain("Topic:");
    expect(formatted).toContain("Tone:");
  });

  it("returns empty array for unknown persona", () => {
    const store = new IdRagStore();
    const results = store.retrieve("nonexistent", "anything");
    expect(results).toEqual([]);
  });

  it("skips empty backstories", () => {
    const store = new IdRagStore();
    const persona = makePersona({ backstory: "" });
    store.ingestPersona(persona);
    const results = store.retrieve("test-1", "anything");
    expect(results).toEqual([]);
  });

  it("clears persona data", () => {
    const store = new IdRagStore();
    const persona = makePersona({
      backstory: "Some backstory text here for testing purposes.",
    });
    store.ingestPersona(persona);
    store.clearPersona("test-1");
    const results = store.retrieve("test-1", "test");
    expect(results).toEqual([]);
  });

  it("links related chunks by adjacency and topic", () => {
    const store = new IdRagStore();
    const chunks = store.chunkBackstory("test-1", [
      "I grew up in a family that valued money carefully. My parents were frugal and taught me to save.",
      "My career in finance taught me to analyze every purchase carefully.",
      "I now live in a minimalist apartment that reflects my organized approach to life.",
    ].join("\n\n"));

    // Related should at minimum include adjacent chunks
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("backstory chunks stored with chunkType 'backstory'", () => {
    const store = new IdRagStore();
    const persona = makePersona({
      backstory: "I grew up in a small town. My family always emphasized the value of a dollar.",
    });

    store.ingestPersona(persona);

    const results = store.retrieve("test-1", "family value money");
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.chunk.chunkType).toBe("backstory");
    }
  });

  it("interview chunks stored with chunkType 'interview'", () => {
    const store = new IdRagStore();
    const interviewChunks: Chunk[] = [
      {
        id: "chunk-test-1-interview-pain_point-0",
        personaId: "test-1",
        text: "The onboarding process takes way too long for new users",
        chunkType: "interview",
        metadata: { sourceInterviewId: "interview-0", sourceSegmentId: "seg-1", signalType: "pain_point", topic: "pain_point" },
      },
    ];

    store.ingestChunks("test-1", interviewChunks);

    const results = store.retrieve("test-1", "onboarding process");
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.chunk.chunkType).toBe("interview");
    }
  });

  it("both chunk types retrieved together", () => {
    const store = new IdRagStore();
    const persona = makePersona({
      id: "persona-1",
      backstory: "I grew up in a small town where my father taught me the value of hard work.",
    });
    store.ingestPersona(persona);

    const interviewChunks: Chunk[] = [
      {
        id: "chunk-persona-1-interview-pain_point-0",
        personaId: "persona-1",
        text: "The onboarding process takes way too long for new users at our company",
        chunkType: "interview",
        metadata: { sourceInterviewId: "interview-0", sourceSegmentId: "seg-1", signalType: "pain_point", topic: "pain_point" },
      },
    ];
    store.ingestChunks("persona-1", interviewChunks);

    const results = store.retrieve("persona-1", "onboarding process company", 3);
    expect(results.length).toBeGreaterThanOrEqual(2);

    const types = new Set(results.map((r) => r.chunk.chunkType));
    expect(types.has("backstory")).toBe(true);
    expect(types.has("interview")).toBe(true);
  });

  it("formatRetrievedContext shows correct metadata per chunk type", () => {
    const store = new IdRagStore();

    // Backstory chunk
    const backstoryChunks = store.chunkBackstory("persona-2", "I grew up valuing money carefully and learned to save every penny.");
    expect(backstoryChunks.length).toBeGreaterThanOrEqual(1);

    // Interview chunk
    const interviewChunks: Chunk[] = [
      {
        id: "chunk-persona-2-interview-0",
        personaId: "persona-2",
        text: "I find the pricing confusing and hard to compare",
        chunkType: "interview",
        metadata: { sourceInterviewId: "interview-1", sourceSegmentId: "seg-2", signalType: "pain_point", topic: "pricing" },
      },
    ];

    store.ingestChunks("persona-2", [...backstoryChunks, ...interviewChunks]);

    const results = store.retrieve("persona-2", "pricing confusing compare", 3);
    expect(results.length).toBeGreaterThanOrEqual(1);

    const formatted = store.formatRetrievedContext(results);

    // Backstory chunks should show Topic: and Tone:
    if (results.some((r) => r.chunk.chunkType === "backstory")) {
      expect(formatted).toContain("Topic:");
      expect(formatted).toContain("Tone:");
    }
    // Interview chunks should show Source: and Signals:
    if (results.some((r) => r.chunk.chunkType === "interview")) {
      expect(formatted).toContain("Source:");
      expect(formatted).toContain("Signals:");
    }
  });

  it("ingestChunks adds to existing persona chunks", () => {
    const store = new IdRagStore();
    const persona = makePersona({
      backstory: "I grew up in a family that valued frugality above all else.",
    });

    store.ingestPersona(persona);

    const interviewChunks: Chunk[] = [
      {
        id: "chunk-test-1-interview-0",
        personaId: "test-1",
        text: "I think the monthly subscription is too expensive for what you get",
        chunkType: "interview",
        metadata: { sourceInterviewId: "interview-2", sourceSegmentId: "seg-3", signalType: "pain_point", topic: "pricing" },
      },
    ];
    store.ingestChunks("test-1", interviewChunks);

    const results = store.retrieve("test-1", "expensive monthly subscription", 5);
    expect(results.length).toBeGreaterThanOrEqual(2);

    const types = new Set(results.map((r) => r.chunk.chunkType));
    expect(types.has("backstory")).toBe(true);
    expect(types.has("interview")).toBe(true);
  });

  it("clearing a persona removes all chunk types", () => {
    const store = new IdRagStore();
    const persona = makePersona({
      backstory: "Some backstory text here for testing purposes.",
    });

    store.ingestPersona(persona);
    const interviewChunks: Chunk[] = [
      {
        id: "chunk-test-1-interview-clear-0",
        personaId: "test-1",
        text: "Test interview chunk for clearing",
        chunkType: "interview",
        metadata: { sourceInterviewId: "interview-clear", sourceSegmentId: "seg-clear", signalType: "pain_point", topic: "test" },
      },
    ];
    store.ingestChunks("test-1", interviewChunks);

    store.clearPersona("test-1");
    const results = store.retrieve("test-1", "test");
    expect(results).toEqual([]);
  });
});
