# Product Backlog

## Research Foundation

This project is grounded in **"Deep Binding of Language Model Virtual Personas"** (Kang et al., UC Berkeley). Key insights:

- **Narrative Identity**: Personas internalize life stories; detailed backstories → deeper binding to decision-making patterns
- **Consistency Matters**: 54% improvement in persona fidelity when using LLM-as-critic to validate backstory coherence
- **Length Matters**: 10x longer backstories (2500+ tokens from multi-turn interviews) vs single-question approach
- **Financial Context**: For pricing evaluation, backstories MUST reveal spending patterns, ROI calculations, risk tolerance, financial pressures

### Prompt Strategy

1. **Initial Personas**: Emphasize diverse financial profiles + decision-making styles
2. **Backstories**: Interview-style (not monologue), internally consistent, financially grounded
3. **Validation** (future): LLM-as-critic checks for contradictions before using in evaluation
4. **Judge Prompts** (future): LLMs evaluate pricing pages AS personas, not about personas

## In Progress

### Core Persona Generation Features
- [x] **Improved LLM Prompts** - Initial persona generation + backstory prompts (Deep Binding research-backed)
- [x] **Extended Backstory Generation** - Multi-turn interview approach (5000+ tokens per backstory)
- [x] **GeneratePersonasUseCase** - Orchestrates persona and backstory generation
- [x] **OpenRouterAdapter** - Implements LLM service port with research-backed prompts
- [x] **generatePersonasAction** - Server action wiring use case to frontend
- [x] **Dashboard UI** - Generate personas from custom customer profile + display with full backstories
- [x] **Expandable Backstory** - Backstories hidden by default, expandable on click
- [ ] **Consistency Validation** - LLM-as-critic to validate backstory coherence (Phase 2)

## Planned (Phase 2)

### Pricing Page Analysis
- [ ] **Parse Pricing Pages** - Extract pricing structure, tiers, features from URL
- [ ] **Judge Prompts** - Create LLM prompt that evaluates pricing from each persona's perspective
- [ ] **Response Generation** - Generate synthetic responses showing how personas react
- [ ] **Score & Metrics** - Calculate value perception, doubts, abandonment risks per persona
- [ ] **Results Display** - Show analysis results in UI alongside personas

### Additional Improvements
- [ ] **Consistency Validation** - LLM-as-critic checks backstory coherence before use

## Backlog

- [ ] **Multi-language Support** - Generate personas and responses in other languages
- [ ] **Custom Persona Profiles** - Allow users to create custom persona templates
- [ ] **Historical Analysis** - Track how personas respond to pricing over time
- [ ] **A/B Testing** - Test alternative pricing pages against personas
- [ ] **Export Results** - PDF/CSV export of persona analysis
- [ ] **Webhooks** - Trigger analysis on pricing page updates
- [ ] **CLI Tool** - Command-line interface for batch persona generation

## Done

- [x] Architecture scaffold and domain entities
- [x] Improved LLM prompts (Deep Binding research-backed)
- [x] GeneratePersonasUseCase implementation
- [x] OpenRouterAdapter with realistic prompts
- [x] Server action layer (generatePersonasAction)
- [x] Dashboard UI with persona generation and display
- [x] AI_README.md updated for server actions pattern
