# Product Improvement Plan — Linear PM Feedback Analysis

## Executive Summary

The Linear PM's feedback identifies a fundamental problem: **the personas lack B2B SaaS domain expertise**, causing them to flag standard industry practices as risks and produce non-credible evaluations. The feedback is accurate and actionable. This plan addresses the root causes and proposes concrete changes.

---

## Root Cause Analysis

### Problem 1: Personas Lack Domain Calibration

**What the PM said:** *"Series A VPs of Engineering do not blink at $10–16/month for a core engineering tool."*

**Root cause:** The persona generation prompt (`PersonaAdapter.ts:16-56`) tells the LLM to create "realistic buyer personas for SaaS pricing evaluation" but provides **zero contextual knowledge about B2B SaaS pricing norms**. The LLM falls back to generic consumer-software expectations where $10/user seems expensive and "Contact Sales" means hidden fees.

The prompt has:
- Big Five definitions (C, N, O, E, A) ✅
- Values/fears guidance ✅
- Communication/decision style guidance ✅
- **No domain calibration** ❌ — No instruction like "As a B2B SaaS professional, you know that $10-16/user is standard. You know Enterprise custom pricing is normal for compliance/SAML/SSO."

### Problem 2: Contradictory Scores vs. Qualitative Feedback

**What the PM said:** *"If two out of three personas think the Free tier is generous, why is the page getting a Clarity score of 4/10 and Trust of 3/10?"*

**Root cause:** The scoring guidance in `VisionAnalysisAdapter.ts` tells the LLM to generate scores based on personality, but doesn't explicitly instruct it to **calibrate scores to the qualitative sentiment**. Quinn says "generous" with 7/7/6/6 scores. Tatum says "joke" with 4/5/3/2. The contradiction the PM spotted is actually CORRECT differentiation — but the *report format* presented it poorly. The PM expected the report to highlight disagreement as ambivalence, not present it as authoritative contradiction.

However, there IS a real issue: the scores aren't always consistent with the qualitative feedback. The fix is better scoring calibration guidance.

### Problem 3: Penalizing Standard Industry Mechanics

**What the PM said:** *"Every major B2B SaaS company uses custom pricing for Enterprise."*

**Root cause:** The analysis prompt doesn't encode B2B SaaS domain knowledge. The LLM treats "Contact Sales" as suspicious because its training data includes consumer anti-patterns about hidden pricing. A real VP Eng knows Enterprise pricing is almost always custom. **The persona needs to know what they'd actually know.**

### Problem 4: Zero Actionable Recommendations

**What the PM said:** *"Lists grievances but offers no concrete design or copy solutions."*

**Root cause:** The `PricingAnalysis` entity (`PricingAnalysis.ts`) has no field for recommendations or suggestions. The analysis schema only captures: `gutReaction`, `thoughts`, `scores`, `risks`. There's no `recommendations`, `suggestions`, or `actionItems` field.

---

## What's Actually Valuable (the 1.5/10 Nugget)

The PM validated one thing: **"Beta" labels on premium features may cause hesitation.** This is the kind of specific, actionable insight the product should be generating — and it only emerged by accident from the current implementation. The fix is to **design for this kind of output deliberately**.

---

## Action Plan

### Phase 1: Domain Calibration (High Priority, Quick Fix)

**Changes to persona generation:**

1. **Add B2B SaaS domain context to the generation prompt** (`PersonaAdapter.ts:44-55`):
   ```
   DOMAIN CALIBRATION — Your personas operate in B2B SaaS context:
   - $10-16/user/month is STANDARD for professional engineering tools
   - Enterprise "Contact Sales" pricing is NORMAL for compliance, SAML, SSO, SLAs
   - Beta features next to paid tiers are COMMON in fast-moving SaaS
   - 250 issues in a Free tier is a reasonable trial limit for evaluation
   ```

2. **Add domain calibration to the analysis prompt** (`VisionAnalysisAdapter.ts`):
   ```
   You are evaluating this as a B2B SaaS professional. You know:
   - Enterprise pricing is typically custom (compliance, SAML, SSO, SLAs)
   - $10-16/user/month is within normal range for engineering tools
   - Free tier limits (250 issues, 2 teams) are standard trial constraints
   ```

3. **Add a `domainContext` field to Persona** — stores what domain knowledge the persona has, so different personas can have different calibrations (e.g., a junior dev vs. a seasoned VP will have different expectations).

### Phase 2: Scoring Calibration (High Priority, Quick Fix)

4. **Fix scoring guidance** in `VisionAnalysisAdapter.ts` to enforce score-sentiment alignment:
   ```
   SCORING-SENTIMENT ALIGNMENT:
   - Your scores MUST be consistent with your gut reaction and thoughts.
   - If you say the free tier is "generous", Clarity should be 6+.
   - If you say the pricing is a "bait-and-switch", Clarity should be 4 or below.
   - If you express trust issues in your thoughts, Trust score must reflect that.
   ```

5. **Add disagreement highlighting** to the report format: When personas disagree on a dimension, flag it as "Ambivalence detected — 2/3 personas found X positive, 1/3 found X negative" rather than presenting the average as fact.

### Phase 3: Actionable Output (Medium Priority)

6. **Add `recommendations: string[]` to `PricingAnalysis` entity** — ask each persona: "Based on your evaluation, what specific copy, pricing, or UX change would you recommend?" This forces constructive output.

7. **Add `criticalConcerns: string[]` to `PricingAnalysis`** — differentiate between "minor annoyance" and "dealbreaker" so the report can prioritize.

8. **Add `validationHypotheses: string[]`** — for each concern, generate a testable hypothesis: "If we remove the 'Beta' label from AI features, Trust scores may improve by X points."

### Phase 4: Credibility & Trust (Ongoing)

9. **Add confidence/disclaimer to output**: "This analysis was generated by AI personas synthesized from your target market description. Scores represent simulated responses, not validated user research. Use as rapid hypothesis generation, not replacement for user testing."

10. **Add persona source transparency**: Each persona card in the UI should show a "Synthetic Persona" badge so users understand the methodology.

### Phase 5: The Real Fix (Long-term)

11. **Build the transcript-to-persona pipeline** (Section 4 of the research): Allow users to upload interview transcripts, survey responses, or customer emails. Extract personas from real data rather than generating them from prompts. This directly addresses "Can you show me the real VPs of Engineering who gave this feedback?"

---

## Implementation Priority Matrix

| Change | Effort | Impact | Priority |
|--------|--------|--------|----------|
| Add domain calibration to generation prompt | 1 file, 10 lines | High — fixes credibility | P0 |
| Add domain calibration to analysis prompt | 1 file, 10 lines | High — fixes credibility | P0 |
| Fix scoring-sentiment alignment | 1 file, 5 lines | High — fixes contradiction | P0 |
| Add `recommendations` to PricingAnalysis | 2 files, 15 lines | High — makes output actionable | P1 |
| Add critical concerns / validation hypotheses | 2 files, 20 lines | Medium — enriches output | P2 |
| Add disagreement highlighting in report | 1 file, 10 lines | Medium — improves credibility | P2 |
| Add synthetic persona disclaimer | 1 file, 5 lines | Low — manages expectations | P2 |
| Add `domainContext` field to Persona | 3 files, 30 lines | Medium — enables personas with different expertise | P1 |
| Build transcript-to-persona pipeline | New feature (large) | High — long-term fix | Future |

---

## Files That Need Changes

| File | Change |
|------|--------|
| `src/infrastructure/adapters/PersonaAdapter.ts` | Add domain calibration to generation prompt (P0) |
| `src/infrastructure/adapters/VisionAnalysisAdapter.ts` | Add domain calibration + scoring-sentiment alignment to analysis prompts (P0) |
| `src/domain/entities/PricingAnalysis.ts` | Add `recommendations`, `criticalConcerns`, `validationHypotheses` fields (P1) |
| `src/domain/entities/Persona.ts` | Add optional `domainContext` field (P1) |
| `src/domain/entities/MockPersonas.ts` | Update mock personas with `domainContext` |
| `src/infrastructure/adapters/PersonaPromptCompiler.ts` | Optionally include domain context in psychographic section |
| `src/components/custom/PersonaProfilePanel.tsx` | Show "Synthetic Persona" badge (P2) |
