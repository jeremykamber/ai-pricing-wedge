import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatTime, parseArgs, createMockPersonas } from "../benchmark";

describe("formatTime", () => {
  it("formats milliseconds to seconds with 3 decimals", () => {
    expect(formatTime(100)).toBe("0.100s");
    expect(formatTime(1500)).toBe("1.500s");
    expect(formatTime(10000)).toBe("10.000s");
  });
});

describe("parseArgs", () => {
  let originalArgv: string[];

  beforeEach(() => {
    originalArgv = process.argv;
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it("defaults to personas+report mode", () => {
    process.argv = ["node", "benchmark"];
    const result = parseArgs();
    expect(result.personasOnly).toBe(false);
    expect(result.useMockPersonas).toBe(false);
    expect(result.url).toBe("https://linear.app/pricing");
  });

  it("parses --personas-only flag", () => {
    process.argv = ["node", "benchmark", "--personas-only"];
    const result = parseArgs();
    expect(result.personasOnly).toBe(true);
  });

  it("parses --use-mock-personas flag", () => {
    process.argv = ["node", "benchmark", "--use-mock-personas"];
    const result = parseArgs();
    expect(result.useMockPersonas).toBe(true);
  });

  it("parses --url flag", () => {
    process.argv = ["node", "benchmark", "--url=https://test.com"];
    const result = parseArgs();
    expect(result.url).toBe("https://test.com");
  });

  it("combines multiple flags", () => {
    process.argv = ["node", "benchmark", "--personas-only", "--url=https://custom.com"];
    const result = parseArgs();
    expect(result.personasOnly).toBe(true);
    expect(result.url).toBe("https://custom.com");
  });
});

describe("createMockPersonas", () => {
  it("returns valid Persona objects", () => {
    const personas = createMockPersonas();
    expect(personas).toHaveLength(2);
    
    const first = personas[0];
    expect(first.id).toBe("mock-1");
    expect(first.name).toBe("Alice Chen");
    expect(first.age).toBe(32);
    expect(first.occupation).toBe("Product Manager");
    expect(first.interests).toEqual(["Productivity tools", "Data analysis"]);
    expect(first.goals).toEqual(["Scale team efficiency", "Reduce costs"]);
    expect(typeof first.conscientiousness).toBe("number");
    expect(typeof first.neuroticism).toBe("number");
  });

  it("returns distinct personas", () => {
    const personas = createMockPersonas();
    expect(personas[0].id).not.toBe(personas[1].id);
    expect(personas[0].name).not.toBe(personas[1].name);
  });
});
