# Enhanced Persona Cards & Modal Implementation Plan

## Overview

We are enhancing the Persona management system by adding deep AI-generated insights, improving the summary card layout, and introducing a high-fidelity "Bento Box" detail modal. This includes updating the domain entity, extending the LLM service for summarization, and implementing a modern, animated UI with glassmorphism effects.

## Current State Analysis

- **Entity**: `Persona` is comprehensive but missing the `aiInsight` field.
- **UI**: `PersonaProfilePanel` shows full backstory without truncation. `AudienceView` uses a custom `fixed` overlay instead of a standard `Dialog`.
- **Backend**: `GeneratePersonasUseCase` stops at backstory generation.
- **Dependencies**: `shadcn` components (Dialog, Progress, ScrollArea) are present. `framer-motion` is missing.

## Desired End State

- Personas have a 2-sentence AI-generated insight summarizing their motivations/risks.
- Cards in the grid are uniform with 2-line truncated backstories.
- A beautiful Bento Box modal displays full psychological scalars, goals, interests, aesthetic DNA, and a searchable backstory vault.
- Modern animations and glassmorphism enhance the "Level 2 Modal" experience.

### Key Discoveries:

- `src/domain/entities/Persona.ts`: Central interface for persona data.
- `src/components/custom/PersonaProfilePanel.tsx`: The card component to be updated.
- `src/application/usecases/GeneratePersonasUseCase.ts`: The orchestrator for persona generation.
- `src/components/ui/card.tsx`: Already has a `glass` variant we can leverage.

## What We're NOT Doing

- Implementing the "Export PDF" functionality *logic* (only the button UI as requested).
- Modifying the simulation or chat logic.
- Changing the initial persona brainstorming prompt.

## Implementation Approach

1.  **Vertical Slice for Data**: Update the domain, ports, and adapters first to ensure the data is available.
2.  **Component Refactoring**: Update the card and create the modal skeleton.
3.  **Bento Layout**: Use CSS Grid for the high-density modular layout.
4.  **Polish**: Add animations and glassmorphism at the end.

---

## Phase 1: Domain & Backend Integration

### Overview

Extend the `Persona` entity and `LlmService` to support "AI Insights".

### Changes Required:

#### 1. Domain Entity
**File**: `src/domain/entities/Persona.ts`
**Changes**: Add `aiInsight?: string` to `Persona` interface and `PersonaSchema`.

#### 2. LLM Service Port
**File**: `src/domain/ports/LlmServicePort.ts`
**Changes**: Add `generatePersonaInsight(persona: Persona): Promise<string>` to the interface.

#### 3. Persona Adapter
**File**: `src/infrastructure/adapters/PersonaAdapter.ts`
**Changes**: Implement `generatePersonaInsight` with the specified system prompt.

```typescript
// System Prompt:
// You are a behavioral psychologist. Analyze this persona's profile and backstory 
// to provide a sharp, 2-sentence 'AI Insight' into their primary motivation 
// and their biggest psychological barrier to conversion. 
// Speak with professional authority and deep empathy.
```

#### 4. Generate Personas Use Case
**File**: `src/application/usecases/GeneratePersonasUseCase.ts`
**Changes**: Call `this.llmService.generatePersonaInsight` for each persona after backstory generation is complete. Update progress steps.

### Success Criteria:

#### Automated Verification:
- [ ] `PersonaSchema` includes `aiInsight`.
- [ ] `GeneratePersonasUseCase` tests (if any) pass or are updated.

---

## Phase 2: Summary Card Enhancements

### Overview

Update the `PersonaProfilePanel` to be more compact and uniform in the grid.

### Changes Required:

#### 1. Persona Profile Panel
**File**: `src/components/custom/PersonaProfilePanel.tsx`
**Changes**: 
- Apply `line-clamp-2` to the description/backstory paragraph.
- Ensure the card has a fixed or consistent height for grid alignment.

### Success Criteria:
#### Manual Verification:
- [ ] Persona cards in the grid show at most 2 lines of backstory.
- [ ] Grid layout remains stable with varied backstory lengths.

---

## Phase 3: Persona Detail Modal (Bento Box)

### Overview

Create a high-fidelity detail view using `shadcn/ui/dialog` and a Bento Box grid.

### Changes Required:

#### 1. Persona Detail Modal Component
**File**: `src/components/custom/PersonaDetailModal.tsx` (New)
**Changes**: 
- Use `Dialog` from `@/components/ui/dialog`.
- Layout: CSS Grid (Bento style).
- **Header**: Name, Age, Occupation, Education, and a placeholder "Export PDF" button.
- **AI Insight Box**: Styled with `bg-primary/10` and `glass` effect.
- **Engine Column**: 
    - Progress bars for `technicalFluency`, `cognitiveReflex`, `economicSensitivity`.
    - Big Five traits (0-100 scale).
- **Human Column**:
    - Bulleted lists for `goals` and `interests`.
    - **Aesthetic DNA**: Small color swatches for `favoriteColors`.
- **Backstory Vault**: 
    - `ScrollArea` for the full backstory text.
    - Search input at the top to filter/highlight keywords (client-side).

#### 2. Audience View Integration
**File**: `src/ui/dashboard/components/views/AudienceView.tsx`
**Changes**: 
- Replace the custom `fixed` overlay with `PersonaDetailModal`.
- Update click handlers to open the modal for the selected persona.

### Success Criteria:
#### Manual Verification:
- [ ] Modal opens correctly on card click.
- [ ] Bento layout is responsive and visually balanced.
- [ ] Progress bars accurately reflect persona scalars.
- [ ] Backstory search filters text or highlights matches.

---

## Phase 4: Animations & Glassmorphism

### Overview

Add the final layer of polish as requested by the user.

### Changes Required:

#### 1. Install Dependencies
**Command**: `npm install framer-motion`
**Reason**: Explicit user preference for smooth Bento transitions.

#### 2. Framer Motion Integration
**File**: `src/components/custom/PersonaDetailModal.tsx`
**Changes**: 
- Add `layoutId` to Bento items for "shared element" feel if possible.
- Use `AnimatePresence` for modal transitions.
- Implement subtle `whileHover` scales on Bento boxes.

#### 3. Styling Refinement
**File**: `src/components/ui/dialog.tsx` or Modal component.
**Changes**: 
- Apply `backdrop-blur-md` and `bg-background/70` for glassmorphism.
- Ensure "Invisible Performance" (clean borders, high contrast).

---

## Testing Strategy

### Unit Tests:
- Verify `generatePersonaInsight` returns 2 sentences.
- Verify `Persona` validation with `aiInsight`.

### Manual Verification:
- Generate 3 personas and check if "AI Insight" is present for each.
- Open modal and verify "Aesthetic DNA" colors match hex codes/names.
- Test PDF button (should be clickable but does nothing/logs to console).

---

## SOLID Analysis

### S (Single Responsibility)
- `PersonaDetailModal`: Only responsible for rendering the detailed view of a persona.
- `PersonaAdapter`: Handles the communication with LLM for specific persona-related tasks (generation, insight).
- The "AI Insight" logic is kept out of the Entity to keep it a pure data structure.

### O (Open/Closed)
- `LlmServicePort` is extended with a new method instead of modifying existing ones.
- `Persona` entity is extended with an optional field, maintaining backwards compatibility with existing mock data.

### L (Liskov Substitution)
- `PersonaDetailModal` will accept the full `Persona` entity, ensuring any "subtype" or version of persona data remains compatible.

### I (Interface Segregation)
- `LlmServicePort` remains clean; new methods are specific to the domain logic being added.

### D (Dependency Inversion)
- The UI depends on the `Persona` entity abstraction rather than concrete generation logic.
- `GeneratePersonasUseCase` continues to depend on the `LlmServicePort` abstraction.

---

## Phase Checklist & Progress

- [x] Phase 1: Backend & Domain Updates
- [x] Phase 2: Summary Card Enhancements
- [x] Phase 3: Persona Detail Modal (Bento Box)
- [x] Phase 4: Animations & Polishing
- [x] Phase 5: Verification & Cleanup
