import { describe, it, expect } from "vitest";
import { ChatPromptCompiler } from "../ChatPromptCompiler";
import type { Persona } from "@/domain/entities/Persona";
import type { PricingAnalysis } from "@/domain/entities/PricingAnalysis";

const basePersona: Persona = {
  id: "test-1",
  name: "Jordan Chen",
  age: 34,
  occupation: "Product Manager",
  educationLevel: "MBA",
  interests: ["saas tools", "hiking", "cooking"],
  goals: ["optimize team velocity", "reduce churn"],
  conscientiousness: 80,
  neuroticism: 60,
  openness: 70,
  extraversion: 45,
  agreeableness: 55,
  values: ["Efficiency", "Transparency"],
  fears: ["Wasted effort", "Vendor lock-in"],
  communicationStyle: "Direct",
  decisionStyle: "Data-driven",
  backstory: "I grew up in a family of engineers.",
};

const sampleAnalysis: PricingAnalysis = {
  id: "analysis-1",
  url: "https://example.com/pricing",
  screenshotBase64: "",
  thoughts: "This pricing page is confusing...",
  scores: {
    clarity: 40,
    clarityReason: "unclear tiers",
    valuePerception: 60,
    valuePerceptionReason: "reasonable value",
    trust: 50,
    trustReason: "neutral",
    explorationIntent: 70,
    explorationIntentReason: "curious",
    analysisIntent: 65,
    analysisIntentReason: "interested",
    buyIntent: 30,
    buyIntentReason: "still evaluating",
  },
  risks: ["hidden fees", "lock-in"],
  recommendations: ["simplify tiers"],
  aiSuggestion: "Add clear pricing tiers",
};

describe("ChatPromptCompiler", () => {
  it("returns a messages array with system, history, frame, and user entries", () => {
    const compiler = new ChatPromptCompiler();
    const messages = compiler.compileChatMessages({
      persona: basePersona,
      analysis: null,
      message: "Hello!",
      history: [],
      ragContext: { contextString: "", chunkCount: 0 },
      needsRegrounding: false,
    });

    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("system");
    expect((messages[1] as { role: string; content: string }).content).toMatch(/\[Frame: .+\]/);
    expect(messages[2].role).toBe("user");
    expect((messages[2] as { role: string; content: string }).content).toBe("Hello!");
  });

  it("includes analysis context when analysis is provided", () => {
    const compiler = new ChatPromptCompiler();
    const messages = compiler.compileChatMessages({
      persona: basePersona,
      analysis: sampleAnalysis,
      message: "Tell me about the pricing",
      history: [],
      ragContext: { contextString: "", chunkCount: 0 },
      needsRegrounding: false,
    });

    const system = messages[0].content as string;
    expect(system).toContain("CONTEXT OF YOUR RECENT ANALYSIS");
    expect(system).toContain("hidden fees");
    expect(system).toContain("This pricing page is confusing");
    expect(system).toContain("interviewing you about your thoughts");
  });

  it("includes simulation-response grounding when analysis is a PersonaResponse", () => {
    const compiler = new ChatPromptCompiler();
    const messages = compiler.compileChatMessages({
      persona: basePersona,
      analysis: {
        id: "resp-1",
        screenshotBase64: "",
        rawAnalysis: "raw stream",
        overview: "I found the onboarding confusing but the pricing clear.",
        customerJourney: [
          { stage: "interpretation", description: "I tried to figure out what this does.", sentiment: "neutral", outcome: "succeeded" },
          { stage: "understanding", description: "The value prop clicked.", sentiment: "positive", outcome: "succeeded" },
          { stage: "belief", description: "I started to trust it.", sentiment: "neutral", outcome: "succeeded" },
          { stage: "motivation", description: "I wanted to sign up.", sentiment: "positive", outcome: "succeeded" },
          { stage: "action", description: "I hit the paywall.", sentiment: "negative", outcome: "blocked", transition: "Pricing hidden until demo" },
        ],
        researchQuestionAnswer: "Pricing visibility is the blocker.",
        majorFindings: [
          { observation: "Paywall appears too early", evidence: "Hit signup wall at action stage", impact: "Drop-off" },
        ],
        pointsOfFriction: ["Pricing hidden"],
        unansweredQuestions: ["What does it cost?"],
        personaProfile: { name: "Jordan Chen", occupation: "Product Manager", bigFive: { conscientiousness: 80, neuroticism: 60, openness: 70, extraversion: 45, agreeableness: 55 }, values: ["Efficiency"], fears: ["Wasted effort"], communicationStyle: "Direct", decisionStyle: "Data-driven" },
      },
      message: "What did you think?",
      history: [],
      ragContext: { contextString: "", chunkCount: 0 },
      needsRegrounding: false,
    });

    const system = messages[0].content as string;
    expect(system).toContain("CONTEXT OF WHAT YOU JUST EXPERIENCED IN THE SIMULATION");
    expect(system).toContain("I found the onboarding confusing but the pricing clear.");
    expect(system).toContain("action: I hit the paywall. (felt negative, blocked) — Pricing hidden until demo");
    expect(system).toContain("Paywall appears too early");
    expect(system).toContain("Pricing hidden");
    expect(system).toContain("What does it cost?");
    expect(system).toContain("Pricing visibility is the blocker.");
    expect(system).toContain("interviewing you about what you just saw and experienced");
    // The legacy pricing branch must NOT leak into simulation grounding.
    expect(system).not.toContain("CONTEXT OF YOUR RECENT PRICING ANALYSIS");
  });

  it("includes introductory framing when no analysis is provided", () => {
    const compiler = new ChatPromptCompiler();
    const messages = compiler.compileChatMessages({
      persona: basePersona,
      analysis: null,
      message: "Hi there!",
      history: [],
      ragContext: { contextString: "", chunkCount: 0 },
      needsRegrounding: false,
    });

    const system = messages[0].content as string;
    expect(system).toContain("chatting with a developer who wants to get to know you");
    expect(system).not.toContain("CONTEXT OF YOUR RECENT ANALYSIS");
  });

  it("includes regrounding instruction when needsRegrounding is true", () => {
    const compiler = new ChatPromptCompiler();
    const messages = compiler.compileChatMessages({
      persona: basePersona,
      analysis: null,
      message: "What do you think?",
      history: [],
      ragContext: { contextString: "", chunkCount: 0 },
      needsRegrounding: true,
    });

    const system = messages[0].content as string;
    expect(system).toContain("<<REGROUND>>");
    expect(system).toContain("re-center yourself");
    expect(system).toContain(basePersona.name);
  });

  it("omits regrounding instruction when needsRegrounding is false", () => {
    const compiler = new ChatPromptCompiler();
    const messages = compiler.compileChatMessages({
      persona: basePersona,
      analysis: null,
      message: "What do you think?",
      history: [],
      ragContext: { contextString: "", chunkCount: 0 },
      needsRegrounding: false,
    });

    const system = messages[0].content as string;
    expect(system).not.toContain("<<REGROUND>>");
  });

  it("includes <<RETRIEVED MEMORY>> section when rag context is present", () => {
    const compiler = new ChatPromptCompiler();
    const messages = compiler.compileChatMessages({
      persona: basePersona,
      analysis: null,
      message: "What do you think?",
      history: [],
      ragContext: { contextString: "Jordan once lost $5,000 on an annual plan.", chunkCount: 1 },
      needsRegrounding: false,
    });

    const system = messages[0].content as string;
    expect(system).toContain("<<RETRIEVED MEMORY>>");
    expect(system).toContain("lost $5,000");
  });

  it("omits <<RETRIEVED MEMORY>> section when rag context is empty", () => {
    const compiler = new ChatPromptCompiler();
    const messages = compiler.compileChatMessages({
      persona: basePersona,
      analysis: null,
      message: "What do you think?",
      history: [],
      ragContext: { contextString: "", chunkCount: 0 },
      needsRegrounding: false,
    });

    const system = messages[0].content as string;
    expect(system).not.toContain("<<RETRIEVED MEMORY>>");
  });

  it("preserves conversation history in the messages array", () => {
    const compiler = new ChatPromptCompiler();
    const history = [
      { role: "user" as const, content: "First message" },
      { role: "assistant" as const, content: "First response" },
      { role: "user" as const, content: "Second message" },
    ];
    const messages = compiler.compileChatMessages({
      persona: basePersona,
      analysis: null,
      message: "Third message",
      history,
      ragContext: { contextString: "", chunkCount: 0 },
      needsRegrounding: false,
    });

    // Structure: [system, history[0], history[1], history[2], frame, user]
    expect(messages).toHaveLength(6);
    expect(messages[1].role).toBe("user");
    expect((messages[1] as { role: string; content: string }).content).toBe("First message");
    expect(messages[2].role).toBe("assistant");
    expect((messages[3] as { role: string; content: string }).content).toBe("Second message");
    expect(messages[4].role).toBe("system");
    expect((messages[4] as { role: string; content: string }).content).toMatch(/\[Frame: .+\]/);
    expect(messages[5].role).toBe("user");
    expect((messages[5] as { role: string; content: string }).content).toBe("Third message");
  });

  it("includes persona identity info in the system message", () => {
    const compiler = new ChatPromptCompiler();
    const messages = compiler.compileChatMessages({
      persona: basePersona,
      analysis: null,
      message: "Hello",
      history: [],
      ragContext: { contextString: "", chunkCount: 0 },
      needsRegrounding: false,
    });

    const system = messages[0].content as string;
    expect(system).toContain("Jordan Chen");
    expect(system).toContain("Product Manager");
    expect(system).toContain("<<PERSONA IDENTITY>>");
    expect(system).toContain("<<PSYCHOGRAPHIC PROFILE>>");
  });

  it("includes DEEP BINDING and character instructions in system message", () => {
    const compiler = new ChatPromptCompiler();
    const messages = compiler.compileChatMessages({
      persona: basePersona,
      analysis: null,
      message: "Hello",
      history: [],
      ragContext: { contextString: "", chunkCount: 0 },
      needsRegrounding: false,
    });

    const system = messages[0].content as string;
    expect(system).toContain("STAY IN CHARACTER");
    expect(system).toContain("DEEP BINDING");
    expect(system).toContain("BEHAVIORAL FIDELITY");
    expect(system).toContain("You are NOT a creative writing exercise");
  });

  it("generates a frame anchor derived from the persona anchor", () => {
    const compiler = new ChatPromptCompiler();
    const messages = compiler.compileChatMessages({
      persona: basePersona,
      analysis: null,
      message: "Hello",
      history: [],
      ragContext: { contextString: "", chunkCount: 0 },
      needsRegrounding: false,
    });

    const frame = messages[1].content as string;
    // The anchor for a conscientious analytical persona should produce a non-empty tag
    expect(frame).toMatch(/\[Frame: [^\]]+\]/);
    expect(frame.toLowerCase()).toContain("product manager");
  });

  it("compiles a panel synthesis prompt grounded in all responses and the synthesis", () => {
    const compiler = new ChatPromptCompiler();
    const messages = compiler.compilePanelMessages({
      responses: [
        {
          id: "r-1",
          screenshotBase64: "",
          rawAnalysis: "raw",
          overview: "Sarah found the pricing clear but wanted a monthly option.",
          customerJourney: [
            { stage: "interpretation", description: "d", sentiment: "neutral", outcome: "succeeded" },
            { stage: "understanding", description: "d", sentiment: "positive", outcome: "succeeded" },
            { stage: "belief", description: "d", sentiment: "neutral", outcome: "succeeded" },
            { stage: "motivation", description: "d", sentiment: "positive", outcome: "succeeded" },
            { stage: "action", description: "d", sentiment: "negative", outcome: "blocked" },
          ],
          researchQuestionAnswer: "Pricing visibility is the blocker.",
          majorFindings: [{ observation: "Wants a monthly plan", evidence: "Asked at action stage", impact: "Conversion drop" }],
          pointsOfFriction: ["No monthly option"],
          unansweredQuestions: ["Can I pay monthly?"],
          personaProfile: { name: "Sarah Chen", occupation: "Senior Engineer", bigFive: { conscientiousness: 80, neuroticism: 30, openness: 70, extraversion: 50, agreeableness: 60 }, values: ["Transparency"], fears: ["Hidden costs"], communicationStyle: "direct", decisionStyle: "data-driven" },
        },
      ],
      synthesis: {
        overview: "Both personas want pricing flexibility.",
        researchQuestionAnswer: "Monthly pricing would remove the blocker.",
        topFindings: [{ observation: "Pricing opacity blocks action", evidence: "Both paused at pricing", impact: "Drop-off", confidence: "strongly supported", affectedPersonaCount: 2, totalPersonaCount: 2 }],
        disagreements: [],
        biggestFrictions: ["No monthly option"],
        completedCount: 2,
        failedCount: 0,
        totalPersonaCount: 2,
      },
      message: "We're thinking of adding a monthly plan — what would you all think?",
      history: [],
    });

    const system = messages[0].content as string;
    expect(system).toContain("user-research synthesizer");
    // Epistemic discipline: simulated ≠ empirical, four-layer answers.
    expect(system).toContain("SIMULATED users");
    expect(system).toContain("hypothesis to test");
    expect(system).toContain("FINDING");
    expect(system).toContain("EVIDENCE");
    expect(system).toContain("INTERPRETATION");
    expect(system).toContain("VALIDATION");
    expect(system).toContain("DISSENT");
    expect(system).toContain("Sarah Chen");
    expect(system).toContain("Wants a monthly plan");
    expect(system).toContain("No monthly option");
    expect(system).toContain("Pricing opacity blocks action");
    expect(system).toContain("Monthly pricing would remove the blocker.");
    expect(messages).toHaveLength(2); // system + user (no history)
    expect(messages[1].role).toBe("user");
  });
});
