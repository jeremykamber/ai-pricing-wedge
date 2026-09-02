---
date: 2026-02-26T01:10:10-08:00
git_commit: 7de53130c40b40a070c827f54fb92994ffce45d9
branch: feat/enhanced-persona-cards
repository: ai_user_testing_mvp
topic: "Persona Cards and Modal Feature"
tags: [research, codebase, persona, ui, backend]
status: complete
---

# Research: Persona Cards and Modal Feature

## Research Question

Conduct comprehensive research for the persona cards and modal feature.
1. Locate existing 'Persona' schemas, types, and database models.
2. Find any existing persona-related components (cards, lists).
3. Analyze '@DESIGN_SYSTEM.md' and existing UI patterns for modal, glassmorphism, and Bento Box layouts.
4. Verify availability of 'shadcn' components (Dialog, Progress, ScrollArea) and 'framer-motion'.
5. Investigate the current backend structure to determine where to implement the AI insight summarization logic.
6. Perform a SOLID analysis of the existing persona-related code.

## Summary

The persona-related code is well-structured using a Clean Architecture pattern (Entities, Ports, UseCases, Adapters, Actions). The persona schema is comprehensive but currently mapped to a simplified interface in the UI. UI patterns favor "Invisible Performance" and high-density grids. While `framer-motion` is missing, `radix-ui` and `shadcn` components are available for the modal implementation. AI summarization should be integrated into the `GeneratePersonasUseCase`.

## Detailed Findings

### 1. Persona Schemas & Models
- **Entity**: `src/domain/entities/Persona.ts:3` - Defines the `Persona` interface including psychological scalars (Big Five), cognitive engine, and aesthetic DNA.
- **Validation**: `src/domain/entities/Persona.ts:30` - `PersonaSchema` (Zod) for validation.
- **Mock Data**: `src/domain/entities/MockPersonas.ts` - Used for testing/demo flows.

### 2. Existing Persona Components
- **PersonaProfilePanel**: `src/components/custom/PersonaProfilePanel.tsx:19` - A card component that displays persona summary (Name, Occupation/Title, Backstory/Description, Traits).
- **PersonaAvatar**: `src/components/custom/PersonaAvatar.tsx` - Handles avatar rendering for personas.
- **AudienceView**: `src/ui/dashboard/components/views/AudienceView.tsx:14` - Renders a grid of `PersonaProfilePanel` cards.
- **PersonaChat**: `src/ui/dashboard/components/chat/PersonaChat.tsx:14` - Current chat interface, used as an overlay in `AudienceView`.

### 3. Design System & UI Patterns
- **Design Philosophy**: `DESIGN_SYSTEM.md:1` - "Invisible Performance", "Simplicity over Everything".
- **Layouts**: `DESIGN_SYSTEM.md:86` - "High-Density Grids" (2, 3, or 4 columns). `DESIGNER_PROMPT.md:21` mentions "Bento Grids" as an optional pattern.
- **Glassmorphism**: Not natively in the primary philosophy, but `src/components/ui/card.tsx:14` has a `glass` variant using `backdrop-blur-md`.
- **Modals**: `DESIGN_SYSTEM.md:90` (Level 2 Modals) and `DESIGN_SYSTEM.md:107` (Close Button standards). Currently, `AudienceView.tsx:64` uses a custom `fixed` overlay instead of a proper `Dialog`.

### 4. Dependencies
- **shadcn/Radix**:
  - `Dialog`: `src/components/ui/dialog.tsx` (Available)
  - `Progress`: `src/components/ui/progress.tsx` (Available)
  - `ScrollArea`: `src/components/ui/scroll-area.tsx` (Available)
- **framer-motion**: **NOT INSTALLED** (not in `package.json`). Animations currently rely on `tailwindcss` and `tw-animate-css`.

### 5. Backend Structure for AI Insights
- **GeneratePersonasUseCase**: `src/application/usecases/GeneratePersonasUseCase.ts:27` - This is the primary location for persona lifecycle logic. Insight summarization should be added here after backstory generation.
- **LlmServicePort**: `src/domain/ports/LlmServicePort.ts` - Should be extended to include summarization ports.
- **LlmServiceImpl**: `src/infrastructure/adapters/LlmServiceImpl.ts` - Implements the actual LLM calls.

## SOLID Analysis

### Persona Entity (`src/domain/entities/Persona.ts`)
- **S**: Factual representation of the Persona data structure.
- **O**: Adding new psychological metrics requires modification of the central interface and Zod schema.
- **L**: N/A (Simple interface).
- **I**: N/A (No methods).
- **D**: Zero concrete dependencies; relies only on `zod`.

### GeneratePersonasUseCase (`src/application/usecases/GeneratePersonasUseCase.ts`)
- **S**: Single responsibility of orchestrating persona generation steps (brainstorming + backstories).
- **O**: Logic for "abbreviation" is hardcoded via a static flag (Line 23).
- **L**: N/A.
- **I**: Depends on `LlmServicePort` (Port/Interface).
- **D**: Directly imports `p-limit` (Line 75) instead of injecting it or using a generic concurrency port.

### PersonaProfilePanel UI (`src/components/custom/PersonaProfilePanel.tsx`)
- **S**: Displays persona summary.
- **O**: Props use a local `persona` interface (Line 8) which differs from the `Persona` entity, forcing manual mapping in parents.
- **L**: N/A.
- **I**: Extends standard `React.HTMLAttributes`.
- **D**: Hardcoded dependencies on `MinimalCard`, `PersonaAvatar`, and `StatusBadge`.

## Code References
- `src/domain/entities/Persona.ts:3` - Persona Interface
- `src/components/custom/PersonaProfilePanel.tsx:19` - Current Persona Card
- `src/ui/dashboard/components/views/AudienceView.tsx:64` - Current Modal/Overlay Implementation
- `src/application/usecases/GeneratePersonasUseCase.ts:98` - Persona Backstory assignment
- `src/components/ui/dialog.tsx:1` - Shadcn Dialog component

## Open Questions
- Should `framer-motion` be added for smoother "Bento Box" layout transitions?
- Is the "AI insight summarization" meant to be a one-time generation during persona creation, or dynamic based on simulation results?
- Do we need to migrate the custom `PersonaChat` overlay to the standard `Dialog` component to align with the Design System?
