# AGENTS.md

## Project Overview

Kynd is a Next.js application for generating AI personas from audience descriptions or interview data and using those personas for simulations, debates, pricing analysis, and conversational research.

The project follows a layered (Clean Architecture-inspired) design that separates business logic from infrastructure and UI.

---

# Architecture

The project is organized into four primary layers.

```
UI
↓
Application (use cases)
↓
Domain (business rules)
↑
Infrastructure (implements ports)
```

Dependencies always point toward the domain.

## Domain

`src/domain`

Contains the core business model.

Includes:

* Entities
* Value objects
* Zod schemas
* DTOs
* Port interfaces

The domain layer:

* has zero framework dependencies
* does not import React
* does not import Next.js
* does not import Zustand
* does not import OpenAI or external SDKs

Business rules belong here.

---

## Application

`src/application`

Coordinates workflows.

Contains:

* Use cases
* Interview processing pipeline
* Orchestration logic

Application code may depend on the Domain but never on React components.

Examples:

* Generate personas
* Debate orchestration
* Pricing analysis
* Interview signal processing

---

## Infrastructure

`src/infrastructure`

Implements the ports defined by the domain.

Contains adapters for:

* LLM providers
* Browser automation
* Vision models
* Storage
* RAG
* Progress tracking
* Request cancellation
* Mapping between DTOs and domain models

Only infrastructure should communicate with external services.

---

## UI

`src/ui`

Contains application-facing React code.

Includes:

* Dashboard
* Feature hooks
* Zustand stores
* Feature components

Shared UI primitives live under:

```
src/components
```

Server routing lives under:

```
src/app
```

---

# Project Structure

```
src/
├── app/                # Next.js App Router
├── domain/             # Business model
├── application/        # Use cases
├── infrastructure/     # External adapters
├── actions/            # Server Actions
├── ui/                 # Feature UI
├── components/         # Shared UI components
├── templates/          # Plop templates
├── data/
└── lib/

test/                   # End-to-end tests
docs/                   # Project documentation
scripts/                # Utility scripts
public/                 # Static assets
browser_use_backend/    # Browser automation backend
```

---

# Major Features

## Personas

Generate realistic AI personas from:

* Audience descriptions
* Interview uploads
* Existing personas

Personas become the foundation for simulations and debates.

---

## Interviews

Interview uploads are processed through a multi-stage pipeline:

```
Extract Signals
↓

Pool Signals

↓

Sample Personas

↓

Store Personas

↓

Chat / Simulation
```

---

## Simulations

Users can run conversations with generated personas.

Simulation results are stored and can be revisited.

---

## Debates

Multiple personas discuss a topic while remaining in character.

Debates are coordinated through the Debate use case and associated adapters.

---

## Pricing Analysis

Pricing pages can be analyzed through the VPS backend and LLM pipeline.

---

# Audience Description

The product previously referred to the user's target market as an **ICP (Ideal Customer Profile).**

Current UI intentionally avoids the term "ICP."

Instead, users see:

* Audience Description
* Target Market
* Define your target market

Some legacy comments and internal identifiers still reference ICP.

When writing new code or UI, prefer **Audience Description**.

---

# Routing

## Public

```
/
```

Marketing landing page.

---

## Dashboard

```
/dashboard
```

Authenticated application.

Includes:

* Personas
* Interviews
* Simulations
* Debate
* Generation progress

---

## API

```
/api/chat
/api/report
/api/vps/*
```

VPS routes are protected by middleware.

When `IS_VPS !== "true"` they return 404.

When running in VPS mode they require:

```
Authorization: Bearer <VPS_AUTH_TOKEN>
```

---

# State Management

Global state uses Zustand.

Primary stores include:

* Persona
* Simulation
* Debate
* User

Prefer extending existing stores instead of creating new global state.

---

# AI Stack

Primary AI components:

* OpenRouter
* OpenAI SDK
* Vercel AI SDK

All provider-specific logic belongs in Infrastructure.

UI should never call providers directly.

---

# Validation

External data should always be validated using Zod before entering the domain.

Avoid trusting raw LLM responses.

---

# Testing

The project uses:

* Vitest
* Testing Library
* Playwright

Tests are colocated beside source code whenever practical.

End-to-end tests live under:

```
test/
```

Run everything:

```bash
bun vitest run
```

Playwright:

```bash
npx playwright test
```

---

# Development Guidelines

## When adding business logic

Place it inside:

```
domain/
```

---

## When adding workflows

Place them inside:

```
application/usecases/
```

---

## When integrating external APIs

Implement adapters under:

```
infrastructure/adapters/
```

Do not call providers directly from the UI.

---

## When adding React features

Feature-specific code belongs in:

```
src/ui
```

Reusable UI belongs in:

```
src/components
```

---

## When adding routes

Use:

```
src/app
```

Follow the existing App Router structure.

---

# Design Principles

Prefer:

* composition over inheritance
* immutable domain objects
* explicit interfaces
* dependency inversion
* small use cases
* pure business logic

Avoid:

* leaking framework code into the domain
* calling LLM providers directly from UI
* bypassing use cases
* business logic inside React components

---

# Common Development Flow

Adding a new feature typically involves:

1. Update or create domain entities.
2. Add or extend ports.
3. Implement the use case.
4. Implement infrastructure adapters.
5. Add API route or Server Action if required.
6. Connect Zustand store.
7. Build UI.
8. Add tests.

---

# Important Invariants

* Domain remains framework-independent.
* Infrastructure implements domain ports.
* External data is validated before entering the domain.
* Personas are the primary data model throughout the application.
* UI interacts with use cases rather than external providers.
* All protected VPS routes require authentication.
* Progress updates should flow through the existing progress infrastructure.

---

# Technology Stack

| Category   | Technology                            |
| ---------- | ------------------------------------- |
| Framework  | Next.js App Router                    |
| Language   | TypeScript (strict)                   |
| Runtime    | Bun                                   |
| Styling    | Tailwind CSS v4                       |
| Components | shadcn/ui + Radix                     |
| Icons      | Lucide                                |
| Animation  | Framer Motion                         |
| State      | Zustand                               |
| AI         | OpenRouter, OpenAI SDK, Vercel AI SDK |
| Validation | Zod                                   |
| Testing    | Vitest + Playwright                   |
| PDF        | @react-pdf/renderer                   |
| Linting    | ESLint                                |

---

# Repository Conventions

* Use the `@/` path alias.
* Prefer Server Actions where appropriate.
* Keep business logic out of React components.
* Keep adapters focused on external integrations.
* Keep documentation current when architecture changes.
