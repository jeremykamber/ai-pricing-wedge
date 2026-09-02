# Kynd Architecture

**AI-powered user testing** — creates high-fidelity AI personas, simulates their behavior on websites/apps, and produces behavioral insights for pricing pages and product experiences.

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript (strict mode, `react-jsx`) |
| **Runtime** | Bun |
| **Styling** | Tailwind CSS v4 + shadcn/ui (Radix primitives) |
| **State** | Zustand (global) + React Server Actions (data mutations) |
| **AI/LLM** | OpenRouter API, OpenAI SDK, Vercel AI SDK (`@ai-sdk/*`) |
| **Testing** | Vitest (unit/integration), Playwright (E2E), jsdom env |
| **Forms/Scaffold** | Plop (`bunx plop`) for code generation |
| **PDF** | `@react-pdf/renderer` |
| **Linting** | ESLint flat config (`eslint.config.mjs`), Next.js core-web-vitals + TS rules |
| **Deploy** | Netlify |

---

## Directory Structure

```
.
├── src/
│   ├── domain/                    # 🧩 Core business logic (zero external deps)
│   │   ├── entities/              # Business objects + Zod schemas + validation
│   │   ├── ports/                 # Interface contracts (abstractions)
│   │   └── dtos/                  # Data transfer objects
│   ├── application/               # ⚙️ Orchestration layer
│   │   ├── usecases/              # Application services (one class per use case)
│   │   └── interviewPipeline/     # Interview-to-persona signal processing
│   ├── infrastructure/            # 🧱 Adapter implementations (ports → concrete)
│   │   ├── adapters/              # LLM, browser, vision, RAG, chat adapters
│   │   ├── services/              # Browser DB, local storage
│   │   ├── mappers/               # Domain ↔ DTO converters
│   │   ├── AnalysisLogger.ts      # Per-run JSONL logger
│   │   ├── SimulationResultStore.ts
│   │   └── RequestCancellationManager.ts
│   ├── actions/                   # 🚀 React Server Actions (thin bridges)
│   ├── app/                       # 🌐 Next.js App Router
│   │   ├── (marketing)/           # Public landing page
│   │   ├── (app)/dashboard/       # Authenticated app (setup, run, results)
│   │   └── api/                   # Route handlers (chat, report)
│   ├── ui/                        # 🎨 React components + state
│   │   ├── dashboard/             # Dashboard views & chat
│   │   ├── interviews/            # Interview upload
│   │   ├── stores/                # Zustand stores (persona, simulation, user)
│   │   └── hooks/                 # Feature-specific hooks
│   ├── components/                # Shared components
│   │   ├── ui/                    # shadcn/ui primitives (button, card, dialog...)
│   │   └── custom/                # Domain-specific (Persona*, Analysis*, FlowDialog...)
│   ├── lib/utils.ts               # cn() helper (clsx + tailwind-merge)
│   ├── hooks/use-theme.ts         # Shared theme hook
│   └── data/genderless_names.ts   # Static dataset
├── test/                          # E2E & integration test files
├── docs/                          # Architecture guides, research, API docs
├── scripts/                       # Utility scripts (benchmark.ts)
├── src/templates/                 # Plop code-gen templates (Handlebars)
├── prs/                           # PR description drafts
└── thoughts/                      # Development notes, plans, handoffs
```

---

## Hexagonal Architecture (Ports & Adapters)

The project follows a strict **domain-first hexagonal architecture**. Dependency flow is **inward**: outer layers depend on inner layers, never the reverse.

```
┌─────────────────────────────────────────────────┐
│  UI Layer (src/ui, src/components, src/app)     │
│  React components, Zustand stores, pages        │
├─────────────────────────────────────────────────┤
│  Actions Layer (src/actions)                    │
│  React Server Actions — thin wrappers           │
├─────────────────────────────────────────────────┤
│  Application Layer (src/application)            │
│  Use cases — orchestrate domain logic           │
├─────────────────────────────────────────────────┤
│  Domain Layer (src/domain)                      │
│  Entities, Ports (interfaces), DTOs — pure TS   │
├─────────────────────────────────────────────────┤
│  Infrastructure Layer (src/infrastructure)      │
│  Adapters — implement ports (LLM, DB, browser)  │
└─────────────────────────────────────────────────┘
```

### Layer Rules

| Layer | Knows About | Can Import From |
|-------|-------------|----------------|
| **Domain** | Nothing | Nothing (pure TS) |
| **Application** | Domain | Domain only |
| **Infrastructure** | Domain | Domain, Application (types) |
| **Actions** | Application, Infrastructure | Application, Infrastructure |
| **UI** | Actions | Actions, Domain (entities/shapes) |

### Port Interfaces (src/domain/ports)

| Port | Purpose |
|------|---------|
| `LlmServicePort` | All LLM operations: persona gen, analysis, chat, signal extraction |
| `IChatServicePort` | Persona chat responses |
| `ICriticServicePort` | Critical evaluation of persona outputs |
| `IMemoryServicePort` | Memory/context persistence |
| `IGazePredictionPort` | Visual attention prediction |
| `VisionAnalysisServicePort` | Screenshot-based analysis |
| `BrowserServicePort` | Playwright-based browser automation |
| `DatabaseServicePort` | IndexedDB persistence |
| `UserRepositoryPort` | User CRUD operations |
| `LlmClientPort` | Low-level LLM client abstraction |

---

## Data Flow

### Main Simulation Flow

```
User opens Dashboard
  → SetupView shows persona form
  → User enters target description
  → generatePersonasAction (Server Action)
    → GeneratePersonasUseCase.execute()
      → LlmServicePort.generateInitialPersonas()
        → PersonaAdapter → OpenRouter API (DeepSeek V4 Flash)
    → ← Persona[] returned to UI
  → User enters URL, starts simulation
    → AnalyzePricingPageUseCase
      → Browser navigates to URL, takes screenshots
      → LlmServicePort.analyzePricingPageStream()
        → VisionAnalysisAdapter → OpenRouter API (Qwen VL)
      → Streaming text updates to UI via streamable values
    → ← PricingAnalysis[] per persona
  → ResultsView shows analysis per persona
  → User can chat with persona via PersonaChat
    → chatWithPersonaAction → ChatWithPersonaUseCase → LlmServicePort.chatWithPersona()
```

### Interview-to-Persona Pipeline

```
Interview transcript uploaded
  → InterviewUploadClient → generatePersonasFromInterviewsAction
    → GeneratePersonasFromInterviewsUseCase
      → LlmServicePort.extractInterviewSignals()
        → InterviewSignalExtractor (chunking, pooling, sampling, n-gram analysis)
      → LlmServicePort.generateInitialPersonas() (conditioned on signals)
      → LlmServicePort.rationalizePersonas()
        → PsychographicRationalizer (PB&J scaffold)
      → LlmServicePort.generateAbbreviatedBackstoriesBatch()
    → ← Persona[] returned
```

---

## Core Domain Entities

| Entity | File | Key Fields |
|--------|------|------------|
| **Persona** | `src/domain/entities/Persona.ts` | Big Five (OCEAN), values, fears, backstory, communication/decision style, pricing sensitivity |
| **PricingAnalysis** | `src/domain/entities/PricingAnalysis.ts` | Scores (0-100), gut reaction, risks, opportunities, quotes, improvement suggestions |
| **Simulation** | `src/domain/entities/Simulation.ts` | URL, status (IN_PROGRESS, COMPLETED, ERROR, CANCELLED), persona count, analyses |
| **TestingSession** | `src/domain/entities/TestingSession.ts` | Session state, progress tracking |
| **InteractionStep** | `src/domain/entities/InteractionStep.ts` | Individual step in a testing flow |
| **CriticEvaluation** | `src/domain/entities/CriticEvaluation.ts` | Evaluation of persona quality |
| **User** | `src/domain/entities/User.ts` | User account, auth |

---

## Key Use Cases (src/application/usecases)

| Use Case | File | Purpose |
|----------|------|---------|
| `GeneratePersonasUseCase` | `generatePersonas.ts` | Create personas from text description |
| `GeneratePersonasFromInterviewsUseCase` | `generatePersonasFromInterviews.ts` | Extract personas from interview transcripts |
| `ChatWithPersonaUseCase` | `chatWithPersona.ts` | Conversational follow-up with a persona |
| `ParsePricingPageUseCase` | `parsePricingPage.ts` | Run persona through a URL and analyze |
| `PredictGazeUseCase` | `predictGaze.ts` | Predict visual attention on a page |
| `ValidateAnalysisUseCase` | `validateAnalysis.ts` | Validate pricing analysis results |
| `RecordStepUseCase` | `recordStep.ts` | Record an interaction step |
| `RegisterUserUseCase` | `registerUser.ts` | User registration |
| `LoginUserUseCase` | `loginUser.ts` | User login |
| `EditUserUseCase` | `editUser.ts` | User profile edits |
| `DeleteUserUseCase` | `deleteUser.ts` | User account deletion |

---

## Server Actions (src/actions)

Each action is a thin bridge — instantiates deps, calls a use case, returns serializable data.

| Action | Purpose |
|--------|---------|
| `generatePersonasAction` | Generate personas from description |
| `generatePersonasFromInterviewsAction` | Generate personas from interview transcripts |
| `generateSimilarPersonasAction` | Generate persona variations |
| `chatWithPersonaAction` | Stream chat with a persona |
| `analyzePricingPageAction` | Run pricing analysis |
| `validateAnalysisAction` | Validate analysis results |
| `predictGazeAction` | Predict visual attention |
| `getProgressAction` | Get simulation progress |
| `getScreenshotAction` | Capture page screenshot |
| `getSimulationResultAction` | Get completed simulation results |
| `recordStepAction` | Record interaction step |
| `cancelRequestAction` | Cancel ongoing request |

---

## External Integrations

| Service | Purpose | Provider |
|---------|---------|----------|
| **OpenRouter** | LLM API gateway (DeepSeek V4 Flash, Qwen VL, etc.) | `openrouter.ai` |
| **OpenAI** | Fallback/provider for AI SDK | API-compatible |
| **Ollama** | Local LLM for development (Gemma 3 1B) | `localhost:11434` |
| **Browser automation** | Playwright (stealth) for page interaction | Local/CDP |
| **IndexedDB** | Client-side persistence via `idb-keyval` | Browser API |
| **Netlify** | Deployment & hosting | `netlify.toml` |

---

## Configuration

### Environment Variables (`.env`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENROUTER_API_KEY` | Yes | LLM API access |
| `OPENAI_API_KEY` | Fallback | Alternative LLM provider |
| `OLLAMA_BASE_URL` | Local dev | Local LLM endpoint (default: `http://localhost:11434/v1`) |
| `OLLAMA_API_KEY` | Local dev | Local LLM auth |
| `LOG_DIR` | No | Override log directory (default: `cwd/logs/analysis`) |

### LLM Model Configuration

Default models (OpenRouter), configured in `LlmServiceImpl.ts`:

| Purpose | Model |
|---------|-------|
| Text generation | `deepseek/deepseek-v4-flash` |
| Small text | `deepseek/deepseek-v4-flash` |
| Vision analysis | `qwen/qwen3-vl-30b-a3b-instruct` |
| Scout/preview | `qwen/qwen3-vl-30b-a3b-instruct` |
| Extraction | `deepseek/deepseek-v4-flash` |

### Config Files

| File | Purpose |
|------|---------|
| `next.config.ts` | Next.js configuration |
| `tsconfig.json` | TypeScript strict mode, `@/` path alias |
| `vitest.config.ts` | Test runner (jsdom, React plugin, `@` alias) |
| `vitest.setup.ts` | Testing library matchers setup |
| `eslint.config.mjs` | ESLint flat config (Next.js core-web-vitals + TS) |
| `postcss.config.mjs` | PostCSS with Tailwind CSS v4 |
| `components.json` | shadcn/ui component registry |
| `plopfile.mjs` | Code generation scaffold |

---

## Build & Deploy

```bash
# Development
bun dev              # Start Next.js dev server

# Build
bun build            # Production build

# Production
bun start            # Start production server

# Testing
bun vitest run       # Run all tests (unit + integration)
npx playwright test  # Run E2E tests

# Linting
bun lint             # ESLint check

# Code Generation
bunx plop            # Scaffold new entities, use cases, ports, adapters, stores, components

# Benchmarking
bun benchmark        # Run benchmark script (tsx scripts/benchmark.ts)
```

### Deployment (Netlify)

Configuration is in `netlify/netlify.toml` and `.netlify/state.json`. The app is built with `next build` and served via Netlify's Next.js integration.

---

## Testing Strategy

| Test Type | Location | Framework | Purpose |
|-----------|----------|-----------|---------|
| **Unit** | `src/**/__tests__/` | Vitest | Entities, adapters, mappers |
| **Integration** | `src/**/__tests__/*.integration.*` | Vitest | Use cases with real adapters |
| **E2E** | `test/*.test.ts` | Vitest + Playwright | Full system flows |

Tests are **co-located** with source files in `__tests__/` directories. E2E tests live in the root `test/` directory.

---

## Code Generation (Plop)

Predefined generators for consistent scaffolding:

```
bunx plop entity    → Entity + test + mapper + mapper test (+ optional DTO)
bunx plop usecase   → Use case class
bunx plop port      → Port interface
bunx plop adapter   → Adapter + test + port interface
bunx plop service   → Infrastructure service
bunx plop store     → Zustand store
bunx plop component → UI component
```

Templates live in `src/templates/` as Handlebars (`.hbs`) files.
