# How We Turn Interviews Into AI Personas

> A plain-English walkthrough of Kynd's interview-to-persona pipeline.
> No code. No jargon. Just the story of how it works.

---

## The Problem

A UX researcher runs 20 user interviews. Each one is 30-45 minutes of rich conversation — pain points, goals, frustrations, desires. That's 10+ hours of human insight.

But here's the thing: you can't run 20 people through 5 different product concepts and see how they'd react. You can't tweak a feature and re-test with the same people. The insight is locked in transcripts, frozen in time.

**What if you could?**

What if those 20 interviews could become 40 distinct individuals — each with their own personality, decision-making style, and lived experience — that you can chat with, test features against, and ask follow-up questions at 3 AM?

That's what this pipeline does.

---

## The Core Insight

Here's what we learned from the research literature (and it's counterintuitive):

**You cannot reliably extract personality traits from a 30-minute interview.**

A job interview isn't a personality test. The person is performing — managing impressions, responding to rapport with the interviewer, operating in a transient emotional state. When AI tries to score their "Big Five" personality from the transcript, the accuracy is barely better than random.

So we don't try.

Instead, we extract only what's **directly observable** — the things you can point to in the transcript with a highlighter. Then we *generate* the personality at persona-creation time, making sure it's consistent with what was observed.

---

## The Pipeline: Five Steps

### Step 1: Extract (What Did They Actually Say?)

We take each interview transcript and ask an AI a very specific question:

> "Scan this transcript and find me seven things — but ONLY if you can quote the exact sentence."

The seven things we look for:

| What We Extract | Why It's Reliable | Example |
|---|---|---|
| **Pain points** | High — people say "I hate when X" | *"It took us three months just to set up"* |
| **Goals** | High — people say "I'm trying to do Y" | *"I need my team up and running in days"* |
| **Values** | High — people say "it's important that..." | *"I'd rather have 5 things that work than 50 that sort of work"* |
| **Feature desires** | High — people say "I wish it could do X" | *"If I could just drag and drop a CSV..."* |
| **Decision patterns** | Medium-high — people describe how they decide | *"I always ask in the community Slack before buying anything"* |
| **Context** (role, industry) | High — they literally tell you | *"I'm VP of Product at a B2B SaaS with 50 people"* |
| **Communication style** | High — they show you how they talk | Direct? Formal? Metric-oriented? |

Every single extracted item comes with a **verbatim quote**. Nothing is inferred. Nothing is made up.

If we have 20 interviews, we run this extraction on all 20 in parallel. It takes about 15 seconds total.

---

### Step 2: Pool (What's the Pattern Across People?)

Now we have 20 spreadsheets of signals — one per interview. We merge them together, asking:

- *"What are the most common pain points across ALL these people?"*
- *"What goals come up again and again?"*
- *"What values cluster together?"*

If 15 out of 20 people mentioned that "onboarding takes too long," that pain point gets a high weight. If only 2 people mentioned "the reporting is bad," that gets a lower weight.

The result is a **frequency distribution** — a map of what matters to this group of people, and how much.

This step is pure math. It takes less than a millisecond.

---

### Step 3: Sample (Create 40 Individuals From 20 Interviews)

Here's the magic part.

We want 40 personas from 20 interviews. More personas than interviews. How?

We treat those frequency distributions like a DJ treating a crate of records. For each persona we create:

1. **Draw 2-4 pain points** from the distribution (weighted random — the common ones come up more often)
2. **Draw 1-3 goals** the same way
3. **Draw values, feature desires, decision patterns** — all from their respective distributions

Each draw creates a unique combination. Persona A might have the onboarding pain point + the reporting pain point + the pricing pain point. Persona B might have the onboarding pain point + the value of transparency + the community-recommendation decision pattern.

**No two personas are the same.** But all of them are grounded in what real people actually said.

Then we do one sanity check: we ask an AI to scan all 40 combinations and flag any that are internally contradictory. *"This persona wants enterprise-grade everything AND the cheapest possible plan"* — things that don't make sense together. We resample those.

---

### Step 4: Generate (Bring Each Persona to Life)

Each of the 40 signal combinations is now a skeleton. We need to flesh it out into a real person.

This is where the Big Five personality traits come in — **not extracted, but generated to be consistent with the signals**.

If someone's interview signals show they're cautious about spending, value peer recommendations, and hate opaque pricing, the generated persona might be:
- **High Neuroticism** (anxious about risk, needs reassurance)
- **Low Openness** (skeptical of new tools, sticks with what works)
- **High Agreeableness** (trusts recommendations, conflict-avoidant)

We then generate:
- **A narrative backstory** — a 3-5 paragraph life story in first person. How they grew up, their career journey, a specific "purchasing trauma" where they got burned, their current worldview. This is what makes the persona *feel* like a real person.
- **Psychological rationale** — a behind-the-scenes explanation of WHY they are the way they are. *"This person has high Neuroticism because they were burned by a bad contract early in their career..."*
- **Behavioral insights** — a sharp two-sentence take on their primary motivation and their biggest barrier to conversion.

All 40 personas are generated in batches. It takes about 30 seconds.

---

### Step 5: Ground (Give Each Persona a Memory)

Now each persona has:
- A life story (generated)
- Source material (the interview quotes they were drawn from)

We index both into a memory system. When you chat with a persona and ask a question like *"What do you think about our pricing?"*, the system:

1. Finds the most relevant parts of their backstory (e.g., *"they were burned by a bad SaaS contract in 2022"*)
2. Finds the most relevant interview quotes that ground their perspective (e.g., Interview #3: *"I always get trapped by hidden fees"*)
3. Combines them into context so the persona's response is anchored in both their backstory AND real interview data

The result: when a persona says *"I'm skeptical about your pricing — I've been burned before"*, you can click to see the source — the exact quote from the real interview participant who said something similar.

---

## The User Experience

**Upload** — Drop 20 interview transcripts into Kynd. Text files, any format.

**Wait 50 seconds** — Watch as personas materialize one by one: "Analyzing interview 3 of 20...", "Building Sarah, VP of Product...", "Generating backstories..."

**Explore 40 personas** — Each one is a distinct individual with a name, a job, a life story, and a personality profile grounded in real data.

**Chat with any persona** — *"Hey Sarah, what do you think of this feature concept?"* Sarah answers as Sarah — not as a generic AI, but as a VP of Product who values peer recommendations, hates slow onboarding, and wants five things that work perfectly.

**Tweak and retest** — *"What if Sarah was more price-sensitive?"* Adjust a slider. Her psychological rationales update in 5 seconds. Her values shift. Chat with the new Sarah.

**Run a cohort** — *"Show me all the personas who care about onboarding speed."* Filter. Run the same scenario across all of them. See the distribution of reactions.

---

## Why This Matters

A UX researcher with 20 interviews has deep qualitative insight but limited scale. They can't simulate how those 20 people would react to 5 different feature concepts, or 10 pricing tiers, or a completely redesigned onboarding flow.

**This pipeline gives them scale without sacrificing depth.**

40 personas, each grounded in real human data, each internally consistent, each with a traceable line back to something a real person said. That's the difference between "AI slop" and an actually useful research tool.
