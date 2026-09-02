# Persona Browser Agent — Architecture & Design

> **Status**: Design document — pre-implementation
> **Date**: 2026-05-21
> **Authors**: Sisyphus + Jeremy Kamber

## Table of Contents

1. [Vision & Goals](#1-vision--goals)
2. [Key Decisions](#2-key-decisions)
3. [Architecture Overview](#3-architecture-overview)
4. [The Core Loop (Detailed)](#4-the-core-loop-detailed)
5. [Data Structures](#5-data-structures)
6. [Prompt Engineering for Each Step](#6-prompt-engineering-for-each-step)
7. [Where It Sits in the Hexagonal Architecture](#7-where-it-sits-in-the-hexagonal-architecture)
8. [Action Execution: Stagehand `act()` Deep Dive](#8-action-execution-stagehand-act-deep-dive)
9. [Persona Anchor Integration](#9-persona-anchor-integration)
10. [Research Foundations](#10-research-foundations)
11. [Open Questions & Future Work](#11-open-questions--future-work)
12. [Appendix: Stagehand Research](#12-appendix-stagehand-research)

---

## 1. Vision & Goals

### 1.1 What We're Building

A **persona-driven browser agent** that acts as a specific human persona (e.g., Sarah Miller, founder/CEO) while exploring a web app. Unlike traditional automated testing (checklists, scripts, assertions), this agent:

- **Thinks** like the persona at every step ("As a busy CEO, this signup flow wastes my time")
- **Feels** emotions about the experience ("Frustrated — the CTA is hidden below the fold")
- **Acts** on those feelings ("I want to find the pricing page to see if this is in my budget")
- **Reflects** after each action, building a rich timeline of persona experience

The output is not a pass/fail — it's a **structured, step-by-step narrative** of how a specific type of human would experience the product.

### 1.2 Why Not Just Use Stagehand's Built-in `agent()`?

Stagehand's `agent()` method is a black box. You pass it an instruction like "Find the pricing page and evaluate it" and it returns a result. You get:

- ❌ No hooks into individual steps
- ❌ No way to inject persona anchors between steps
- ❌ No access to the model's internal reasoning at each step
- ❌ No structured reflection or emotion tracking
- ❌ No control over what model is used for thinking vs. action

We need **our own agent loop** built on top of Stagehand's primitives (`act()`, `extract()`, `observe()`) so that every step is visible and controllable.

### 1.3 Success Criteria

Given a persona + URL + task description, the agent produces:

1. A **timeline** of every step taken, with:
   - Screenshot before the action
   - The persona's internal thinking
   - The persona's emotional state
   - The persona's desire/intent
   - The action taken
   - Screenshot after the action
   - Whether the action succeeded
2. A **summary report** with:
   - The persona's overall verdict
   - Friction points identified
   - Delight moments
   - Confusion areas
   - Overall sentiment

---

## 2. Key Decisions

### 2.1 Custom Agent Loop (Not Stagehand's `agent()`)

| Decision | We build our own step-by-step loop |
|---|---|
| **Why** | Need hooks into every step for persona anchor injection + reflection capture |
| **Cost** | More code to write; more integration work |
| **Alternative rejected** | Using Stagehand's `agent()` as a black box — no lifecycle hooks |
| **Rationale** | The persona anchor technique (SyTTA, Atri et al. 2026) requires injection before EVERY generation. A black-box loop doesn't expose this. |

### 2.2 Stagehand `act()` for Action Execution (Not Separate CUA Per Step)

| Decision | Use `stagehand.act()` for executing actions |
|---|---|
| **Why** | Cheaper (~$0.02/action vs ~$0.30/action for CUA), more reliable (DOM targeting), faster |
| **How it works** | The thinking LLM describes the action in natural language ("click the 'Pricing' link in the nav"); Stagehand resolves it to the correct DOM element internally using its DOM+vision hybrid engine |
| **Alternative considered** | Spawning a CUA sub-agent per step for pixel-level interaction — adds latency, cost, and failure surface |
| **Future option** | Fall back to CUA when `act()` fails (self-healing mode) |

### 2.3 Single Vision-Capable Model for Thinking + Action Description

| Decision | One LLM call per step that returns thinking + action description |
|---|---|
| **Why** | Simpler architecture; the persona's feelings directly drive the action; no coordination between two models |
| **Model candidates** | Claude Sonnet 4 (best persona reasoning), GPT-4o (fast + cheap), Gemini 2.5 Flash (cheapest) |
| **How** | Return structured JSON via tool_use or structured outputs: `{ thinking, feeling, desire, action: { type, description } }` |
| **Alternative considered** | Two models: one for persona thinking, another for action execution — adds complexity without clear benefit |

### 2.4 Stagehand Hybrid Mode (DOM + Vision)

| Decision | Use Stagehand's hybrid mode which blends DOM and vision-based targeting |
|---|---|
| **Why** | More reliable than pure CUA, more human-like than pure DOM; Stagehand's engine chooses the best approach per action |
| **Note** | Requires `experimental: true` in Stagehand constructor and a model with grounding capabilities |

### 2.5 Full CUA/Vision Mode for the Agent

| Decision | The overall agent operates in full vision mode |
|---|---|
| **Why** | The persona "sees" the page through screenshots, not just DOM text. This is critical for: visual design evaluation, layout understanding, emotional reactions to aesthetics, noticing what's hidden/below-the-fold |
| **How** | Screenshots are passed to the thinking LLM as image inputs at every step |

### 2.6 Real-Time Screenshots for Every Step

| Decision | Capture screenshot before AND after every action |
|---|---|
| **Why** | Before: the persona sees what the page looks like before deciding. After: we record the result of the action. Together they enable replay and analysis. |

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    PersonaBrowserAgent                            │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                      Agent Loop                               │ │
│  │                                                               │ │
│  │  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌───────────────┐  │ │
│  │  │  1.     │ →│  2.      │ →│  3.    │ →│  4.           │  │ │
│  │  │ Capture │  │ Compile  │  │ LLM   │  │ Execute via  │  │ │
│  │  │ State   │  │ Persona  │  │ Think  │  │ stagehand    │  │ │
│  │  │         │  │ Prompt   │  │        │  │ act()         │  │ │
│  │  └─────────┘  └──────────┘  └────────┘  └───────┬───────┘  │ │
│  │                                                   │         │ │
│  │  ┌───────────────────────────────────────────────┐│         │ │
│  │  │  6. Check Done → Compile Report               ││         │ │
│  │  │  ↑                                            ││         │ │
│  │  │  └── 5. Record Step ←─────────────────────────┘┘         │ │
│  │  └──────────────────────────────────────────────────────────┘ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Uses:                                                             │
│  ├── Stagehand (browser control + act())                          │
│  ├── PersonaPromptCompiler (prompt construction)                  │
│  ├── Vision-capable LLM (thinking + action)                       │
│  └── PbjScaffoldEnhancer (optional: inject PB&J rationales)       │
└──────────────────────────────────────────────────────────────────┘
```

### 3.1 Data Flow

```
Persona Entity  ───────────────────┐
                                   ├──→ PersonaPromptCompiler
URL + Task Description  ──────────┤         │
                                   │         ↓
                                   │    Compiled Prompt
                                   │         │
                                   │         ↓
                                   └──→ PersonaBrowserAgent
                                            │
                                     Loop over steps
                                            │
                                      ┌─────┴──────┐
                                      │             │
                                      ↓             ↓
                                   Screenshot    LLM Call
                                      │             │
                                      │        ┌────┴────┐
                                      │        │         │
                                      │    thinking   action
                                      │    feeling    desc
                                      │    desire
                                      │        │
                                      └───┬────┘
                                          │
                                          ↓
                                    Stagehand.act()
                                          │
                                          ↓
                                    Record Step
                                          │
                                    ┌─────┴─────┐
                                    │           │
                                    v           v
                                More steps   Done → BrowserSessionReport
```

---

## 4. The Core Loop (Detailed)

```
Input:  persona: Persona, task: string, url: string, maxSteps: number
Output: BrowserSessionReport

session = { steps: [], startTime: now }

// 1. Initialize browser
stagehand = new Stagehand({ env: "LOCAL", experimental: true })
await stagehand.init()
page = stagehand.context.pages()[0]

// 2. Navigate to target
await page.goto(url)
await waitForPageReady(page)

// 3. Agent loop
for (let step = 0; step < maxSteps; step++) {
  // --- Step 3a: Capture state ---
  screenBefore = await page.screenshot({ type: "jpeg", quality: 60 })

  // --- Step 3b: Compile persona prompt ---
  prompt = buildAgentStepPrompt({
    persona,
    anchor: compiler.generateAnchor(persona),
    screenBefore,            // image input
    actionHistory: session.steps,
    reflectionHistory: session.steps,
    stepNumber: step,
    task,
    url,
  })

  // --- Step 3c: LLM thinks ---
  llmResponse = await callVisionLLM(
    model: "anthropic/claude-sonnet-4-20250514",  // or gemini/gpt-4o
    messages: prompt,
    response_format: {
      thinking: string,      // "Hmm, the pricing is unclear..."
      feeling: string,       // "confused, skeptical"
      desire: string,        // "I want to compare the plans side by side"
      action: {
        type: "click" | "scroll" | "type" | "navigate"
            | "extract" | "observe" | "done" | "error",
        description: string,  // "click on the 'Compare Plans' button"
        value?: string,       // text to type (if type action)
      },
    }
  )

  // --- Step 3d: Check for done ---
  if (llmResponse.action.type === "done") {
    screenAfter = await page.screenshot({ type: "jpeg", quality: 60 })
    session.steps.push({ step, screenBefore, screenAfter, ...llmResponse, actionResult: { success: true } })
    break
  }

  // --- Step 3e: Execute action via Stagehand act() ---
  try {
    if (llmResponse.action.type === "click") {
      await stagehand.act({ action: llmResponse.action.description })
    } else if (llmResponse.action.type === "scroll") {
      await stagehand.act({ action: llmResponse.action.description })
    } else if (llmResponse.action.type === "type") {
      await stagehand.act({
        action: llmResponse.action.description,
        value: llmResponse.action.value,
      })
    } else if (llmResponse.action.type === "navigate") {
      // Only navigate if the URL is part of the same domain (safety)
      await page.goto(llmResponse.action.value)
    } else if (llmResponse.action.type === "extract") {
      extracted = await stagehand.extract({
        instruction: llmResponse.action.description,
        schema: z.object({ ... }),
      })
    }
    actionResult = { success: true }
  } catch (error) {
    actionResult = { success: false, error: error.message }
    // Optional: retry with a more specific instruction
  }

  // --- Step 3f: Capture post-action state ---
  screenAfter = await page.screenshot({ type: "jpeg", quality: 60 })

  // --- Step 3g: Record step ---
  session.steps.push({
    stepNumber: step,
    screenBefore,
    screenAfter,
    thinking: llmResponse.thinking,
    feeling: llmResponse.feeling,
    desire: llmResponse.desire,
    action: llmResponse.action,
    actionResult,
    timestamp: Date.now(),
  })
}

// 4. Close browser
await stagehand.close()

// 5. Compile report
return compileReport(session, persona, task)
```

---

## 5. Data Structures

### 5.1 Step Record

```typescript
interface BrowserAgentStep {
  /** Step index (0-based) */
  stepNumber: number;

  /** Base64 JPEG screenshot before the action */
  screenBefore: string;

  /** Base64 JPEG screenshot after the action */
  screenAfter: string;

  /** Persona's internal thinking at this step.
   *  "Hmm, this pricing page is confusing. There are three tiers but
   *   I can't tell what's different between Pro and Enterprise..." */
  thinking: string;

  /** Persona's emotional state.
   *  "frustrated", "curious", "skeptical", "impatient", "delighted" */
  feeling: string;

  /** Persona's current desire/intent.
   *  "I want to find the feature comparison table" */
  desire: string;

  /** The action taken at this step */
  action: {
    type: "click" | "scroll" | "type" | "navigate"
        | "extract" | "observe" | "done" | "error";
    /** Natural language description of the action.
     *  "click on the 'View Features' link at the bottom of the card" */
    description: string;
    /** Text to type (only for type actions) */
    value?: string;
  };

  /** Whether the action succeeded */
  actionResult: {
    success: boolean;
    error?: string;
    extractedText?: string;
    currentUrl?: string;
  };

  /** When this step occurred */
  timestamp: number;
}
```

### 5.2 Session Report

```typescript
interface BrowserSessionReport {
  /** Metadata */
  persona: Persona;
  personaSnapshot: string; // stringified persona at run time
  task: string;
  url: string;
  startedAt: number;
  completedAt: number;
  totalSteps: number;
  completed: boolean; // false if hit maxSteps

  /** Full step-by-step timeline */
  steps: BrowserAgentStep[];

  /** Summary analysis */
  summary: {
    /** Overall verdict in persona's voice.
     *  "As a busy CEO, this onboarding took way too many clicks..." */
    personaVerdict: string;

    /** Specific moments where the persona felt friction */
    frictionPoints: Array<{
      stepNumber: number;
      description: string;
    }>;

    /** Specific moments of delight or surprise */
    delights: Array<{
      stepNumber: number;
      description: string;
    }>;

    /** Things the persona found confusing */
    confusionAreas: Array<{
      stepNumber: number;
      description: string;
    }>;

    /** Overall sentiment */
    overallSentiment: "positive" | "neutral" | "negative";
  };
}
```

### 5.3 Port Interface

```typescript
/** Port for the persona-driven browser agent.
 *  Part of the hexagonal architecture — depends only on domain types. */
interface PersonaBrowserAgentPort {
  /**
   * Execute a full persona-driven browsing session.
   *
   * @param persona - The persona entity driving the session
   * @param task - What to evaluate ("Explore the signup flow and report friction points")
   * @param url - The starting URL
   * @param options - Optional configuration
   * @returns Structured session report with step-by-step timeline
   */
  execute(
    persona: Persona,
    task: string,
    url: string,
    options?: BrowserAgentOptions,
  ): Promise<BrowserSessionReport>;
}

interface BrowserAgentOptions {
  maxSteps?: number;        // default: 30
  model?: string;           // default: from env
  headless?: boolean;       // default: true
  viewport?: { width: number; height: number };  // default: 1280x800
  enableCaching?: boolean;  // default: true (Stagehand action caching)
}
```

---

## 6. Prompt Engineering for Each Step

### 6.1 The Per-Step Prompt Structure

Every LLM call in the agent loop gets this structure:

```
<<SYSTEM>> [Compartmentalized Persona Prompt]
  <<PERSONA IDENTITY>>
  Name: Sarah Miller
  Age: 34
  Occupation: Founder & CEO
  ...

  <<PSYCHOGRAPHIC PROFILE>>
  Big Five: O=85, C=90, E=65, A=45, N=55
  Values: efficiency, directness, competence
  Fears: wasting time, unclear value proposition
  Communication: direct, slightly impatient
  Decision style: data-driven, fast

  <<EPISTEMIC BOUNDARIES>>
  You know: SaaS products, software pricing, startup operations
  You don't know: technical implementation details, internal company info

  <<BEHAVIORAL GUARDRAILS>>
  Keep responses concise...
  Do NOT break character...

  <<PSYCHOLOGICAL RATIONALES (PB&J)>> [optional]
  [Big Five Personality Roots]
  Sarah has high Conscientiousness because...
  ...

<<USER>>

  <<BROWSER STATE>>
  URL: https://example.com/pricing
  Current URL: https://example.com/pricing

  <<PERSONA ANCHOR>>
  As a passionate first-time founder:

  <<WHAT YOU'VE DONE SO FAR>>
  Step 1: You arrived at the homepage
    You felt: curious — the hero image is compelling but vague
    You wanted: to understand what the product actually does
  Step 2: You clicked "See How It Works"
    You felt: skeptical — the demo video was too polished
    You wanted: to skip the fluff and see pricing
  Step 3: You found and clicked "Pricing" in the top nav
    You felt: impatient — finally, the real information
    You wanted: to compare plans and understand value

  <<WHAT YOU SEE RIGHT NOW>>
  [SCREENSHOT — image input to the vision model]

  <<YOUR TASK>>
  Evaluate the pricing page as Sarah Miller.
  You're looking for: clarity, value communication, trust signals, hidden fees.

  <<YOUR NEXT STEP>>
  As a passionate first-time founder:
  What are you thinking right now? What are you feeling?
  What do you want to do next?

  Respond with structured JSON:
  {
    "thinking": "Your internal monologue...",
    "feeling": "Your emotional state...",
    "desire": "What you want to accomplish...",
    "action": {
      "type": "click|scroll|type|navigate|extract|observe|done",
      "description": "Natural language description of the action to take"
    }
  }
```

### 6.2 Key Prompt Design Choices

| Element | Purpose | Research Basis |
|---|---|---|
| **Compartmentalized system prompt** | Separate identity from task from constraints | Wang et al. (2024b) — prevents attention dilution |
| **Persona anchor before generation** | Reset semantic frame at point of generation | SyTTA / Atri et al. (2026) — 40-60% drift reduction |
| **Big Five with behavioral mappings** | Let model infer correlated micro-behaviors | Joshi et al. (2025) — 6-9% better adherence |
| **Full action history as context** | Prevent repetitive actions, enable coherent narrative | Basic agent loop best practice |
| **Full reflection history as context** | Let emotions compound naturally across steps | Novel to this system |
| **Screenshot as image input** | Vision-based understanding of page state | CUA approach |
| **"You" framing for history** | Maintains first-person immersion | Narrative psychology |
| **Structured JSON output** | Deterministic parsing of thinking + action separation | Engineering reliability |

### 6.3 Persona Anchor: Where and How It Hits

The anchor is injected at **two levels**:

1. **In the step prompt** — as `<<PERSONA ANCHOR>>` and repeated immediately before `<<YOUR NEXT STEP>>`
2. **As the last text before generation** — `"As a [archetype]:"`

This is the SyTTA technique applied to the browser agent loop. The anchor is short (4-16 tokens) and specific to the persona's archetype (detected from Big Five profile):

```
High Neuroticism + High Conscientiousness → "As a cautious, risk-aware manager:"
High Openness + Low Extraversion          → "As an analytical, numbers-driven expert:"
High Extraversion + High Openness         → "As an enthusiastic [interest]:"
Low Neuroticism + High Openness           → "As a passionate first-time founder:"
High Conscientiousness + High Neuroticism → "As a skeptical, veteran [occupation]:"
High Openness + default                   → "As a curious [education] student:"
Fallback                                  → "As [name], a [occupation]:"
```

---

## 7. Where It Sits in the Hexagonal Architecture

### 7.1 Ports (Domain Layer — No Dependencies)

```
src/domain/ports/
  PersonaBrowserAgentPort.ts   ← NEW: the agent interface

src/domain/entities/
  BrowserAgentStep.ts          ← NEW: step data structure
  BrowserSessionReport.ts      ← NEW: session report structure
```

### 7.2 Adapters (Infrastructure Layer — Implements Ports)

```
src/infrastructure/adapters/
  PersonaBrowserAgent.ts       ← NEW: implements PersonaBrowserAgentPort
    Uses: Stagehand, PersonaPromptCompiler, LlmServiceImpl
  RemotePlaywrightAdapter.ts   ← EXISTING: raw Playwright (still used for non-agent browsing)
```

### 7.3 Existing Code That Gets Reused

| Component | Purpose in Agent |
|---|---|
| `PersonaPromptCompiler` | Compiles the per-step persona prompt |
| `PbjScaffoldEnhancer` | Generates PB&J rationales (optional, pre-step) |
| `Persona` entity | The persona that drives the session |
| `LlmServiceImpl` | LLM calls for the thinking step (via OpenRouter) |
| `IdRagService` | Optional: factual grounding during the session |

### 7.4 New Code to Write

| File | Purpose | Priority |
|---|---|---|
| `src/domain/ports/PersonaBrowserAgentPort.ts` | Port interface | Required |
| `src/domain/entities/BrowserAgentStep.ts` | Step data structure | Required |
| `src/domain/entities/BrowserSessionReport.ts` | Report data structure | Required |
| `src/infrastructure/adapters/PersonaBrowserAgent.ts` | Full agent implementation | Required |
| `src/infrastructure/adapters/__tests__/PersonaBrowserAgent.test.ts` | Tests | Required (TDD) |

### 7.5 Dependency Graph

```
PersonaBrowserAgent (adapter)
  │
  ├── depends on ──→ PersonaBrowserAgentPort (port, domain)
  ├── depends on ──→ BrowserAgentStep (entity, domain)
  ├── depends on ──→ BrowserSessionReport (entity, domain)
  ├── depends on ──→ Persona (entity, domain)
  │
  ├── imports ──→ Stagehand (@browserbasehq/stagehand)
  ├── imports ──→ PersonaPromptCompiler (existing adapter)
  ├── imports ──→ LlmServiceImpl (existing adapter → OpenRouter)
  │
  └── may import ──→ PbjScaffoldEnhancer (optional)
                   ──→ IdRagService (optional, future)
```

---

## 8. Action Execution: Stagehand `act()` Deep Dive

### 8.1 How `act()` Works

Stagehand's `act()` is not a simple Playwright action. It uses a **DOM + Vision hybrid engine**:

1. **DOM Analysis**: Stagehand analyzes the page DOM to identify candidate elements matching the instruction
2. **Vision Verification** (optional): It can take a screenshot and overlay bounding boxes to verify the target
3. **Action Execution**: Once the target is identified, it uses Playwright to execute the action
4. **Self-Healing**: If the action fails (element changed, not found), Stagehand retries with AI

### 8.2 Usage in Our Loop

```typescript
// Simple: just the instruction
await stagehand.act({
  action: "click on the 'Pricing' link in the top navigation bar"
});

// With explicit method and value
await stagehand.act({
  action: "type email into the signup field",
  method: "fill",
  arguments: ["sarah@example.com"]
});

// With specific selector (when we know it)
await stagehand.act({
  action: "click the submit button",
  method: "click",
  selector: "button[type='submit']"
});
```

### 8.3 Fallback Strategy

If `act()` fails, the agent can:

1. **Try the same instruction with more specificity** — the LLM gives a more precise description
2. **Try `observe()` first** — list all interactive elements, then pick the right one
3. **Mark the step as failed** and decide whether to continue or abort
4. **Future: Fall back to CUA sub-agent** for pixel-level interaction

### 8.4 Error Recovery in the Loop

```
if actionResult.success === false:
  1. Log the error with screenshot
  2. LLM gets: "Action failed: ${error}. Here's what the page looks like now."
  3. LLM decides: retry with different approach, or skip, or abort
  4. Step is recorded with error details
```

---

## 9. Persona Anchor Integration

### 9.1 Where Anchors Are Injected

Every step prompt contains the anchor in three strategic positions:

```
Position 1: In the header area (reinforces identity)
  <<PERSONA ANCHOR>>
  As a passionate first-time founder:

Position 2: Before the action history (reframes past context)
  <<WHAT YOU'VE DONE SO FAR>>
  As a passionate first-time founder:
  Step 1: ...

Position 3: Immediately before the LLM generates (priming)
  <<YOUR NEXT STEP>>
  As a passionate first-time founder:
  What are you thinking right now? ...
```

This triple-injection follows the SyTTA principle: the last thing the model processes before generating has outsized influence on the output distribution.

### 9.2 Why Not Just One Anchor at the Start

Research shows that tokens at the beginning of context lose attention weight as context grows (the "lost in the middle" phenomenon). In a 30-step browsing session, the single anchor from step 1 is effectively invisible by step 20. Re-injecting the anchor every step maintains near-turn-1 persona fidelity throughout.

### 9.3 Anchor Length Constraint

Anchors are kept to 4-16 tokens specifically:
- Short enough to not consume meaningful context budget
- Long enough to carry the persona's identity signal
- Empirically validated in SyTTA (Atri et al. 2026)

---

## 10. Research Foundations

This architecture directly implements techniques from the literature review (see `docs/RESEARCH.md`):

| Technique | Research Source | How We Implement It |
|---|---|---|
| **Narrative backstory** | Moon et al. (2024) — Anthology | Persona.backstory → compiled into system prompt |
| **Compartmentalized prompts** | Wang et al. (2024b) — Survey | PersonaPromptCompiler: 4 delimited sections |
| **Big Five psychometric grounding** | Joshi et al. (2025) — PB&J | Big Five scores + behavioral mappings in psychographic section |
| **PB&J psychological rationales** | Joshi et al. (2025) | PbjScaffoldEnhancer generates causal explanations |
| **Persona anchors** | Atri et al. (2026) — SyTTA | Injected before every LLM generation in the agent loop |
| **Periodic re-grounding** | Atri et al. (2026b) — PICon | Every step re-grounds via anchor + full persona context |
| **InCharacter evaluation** | Wang et al. (2024a) | Can be applied to session transcripts post-hoc |
| **ID-RAG factual grounding** | Tan et al. (2025) | Future: retrieve relevant persona memories during session |
| **CUA vision-based interaction** | OpenAI (2025) — Operator | Screenshots as image inputs to the thinking model |

---

## 11. Open Questions & Future Work

### 11.1 Immediate Open Questions

1. **Context window management**: A 30-step session with full screenshots + thinking + action history will blow past most context windows. Strategy options:
   - Summarize early steps (lose detail but stay in window)
   - Keep only last N steps in context (sliding window)
   - Keep action descriptions but drop old screenshots
   - **Recommended**: Keep all action descriptions + reflections, drop screenshots after step 5, show only current screenshot

2. **Token budget per step**: Screenshots are expensive (thousands of tokens each as image inputs). Strategy:
   - Compress screenshots aggressively (JPEG quality 40-60)  
   - Only pass screenshot to the thinking model, not the full DOM
   - Use Stagehand's DOM analysis as fallback when vision is unnecessary

3. **Loop termination criteria**: Besides `action.type === "done"` and `maxSteps`, what signals should stop the loop?
   - Persona expresses satisfaction
   - Persona expresses confusion that blocks progress
   - Repeated actions (detect loops)
   - URL matches a "target complete" pattern

4. **Caching for repeated evaluations**: Stagehand supports action caching. Can we cache successful persona sessions for replay?

### 11.2 Future Enhancements

1. **CUA fallback**: When `act()` fails, fall back to a CUA sub-agent for pixel-level interaction
2. **Multi-model routing**: Use a fast model (Gemini Flash) for the first pass, escalate to Claude for complex reasoning
3. **ID-RAG integration**: Retrieve relevant persona memories during the session for factual grounding
4. **Parallel persona evaluation**: Run multiple persona agents simultaneously against the same site
5. **Session replay UI**: Build a playback interface showing screenshots + persona thoughts in sequence
6. **Evaluation via InCharacter**: Run the session transcript through InCharacter evaluation for fidelity scoring
7. **Comparison reports**: Overlay two personas' paths through the same site to compare reactions

---

## 12. Appendix: Stagehand Research

### 12.1 Why Stagehand (Not Alternatives)

| Tool | Verdict | Reason |
|---|---|---|
| **Stagehand** | ✅ **Selected** | TypeScript-native, MIT, 22K+ stars, act/extract/observe/agent primitives, CUA + hybrid mode, self-healing, action caching |
| **Browser Use** | ❌ Rejected | Python-only (65K stars); would require microservice architecture |
| **OpenAI CUA** | ❌ Rejected (for action exec) | Used indirectly via Stagehand's CUA mode; too expensive and unreliable for every step |
| **Playwright MCP** | ❌ Rejected | MCP dependency adds complexity without benefit for our use case |
| **Existing RemotePlaywrightAdapter** | ❌ Replaced (for agent use) | Too low-level (navigate, scroll, screenshot only); no AI-driven interaction |

### 12.2 Stagehand Version & Configuration

```
Package: @browserbasehq/stagehand (v3 latest)
License: MIT
Mode: Hybrid (requires experimental: true)
Action execution: stagehand.act() with natural language descriptions
Extraction: stagehand.extract() with Zod schemas (for structured data)
Observation: stagehand.observe() (for discovering page elements)
```

### 12.3 Stagehand Environments

| Environment | Use Case |
|---|---|
| `LOCAL` | Development, testing — runs Chromium locally |
| `BROWSERBASE` | Production — cloud browsers with stealth, captcha solving, session replay |

Start with `LOCAL` for development, deploy to `BROWSERBASE` for production.

### 12.4 Models That Work with Stagehand Hybrid Mode

| Model | Suitability | Note |
|---|---|---|
| `google/gemini-3-flash-preview` | ✅ Excellent | Fast, cheap, good grounding |
| `anthropic/claude-sonnet-4-20250514` | ✅ Excellent | Best reasoning, best persona work |
| `anthropic/claude-sonnet-4-5-20250929` | ✅ Excellent | Newer, potentially better |
| `anthropic/claude-haiku-4-5-20251001` | ✅ Good | Faster, cheaper, slightly less capable |

Our thinking model (for persona reasoning) can be different from Stagehand's execution model. Recommendation:
- **Thinking**: Claude Sonnet 4 (best persona reasoning)
- **Execution**: Stagehand default model (handled internally, can be a cheaper model)

---

> **Next step**: Implementation in a separate session. Start with the domain entities and port, then the adapter.
