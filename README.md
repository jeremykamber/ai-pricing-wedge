<p align="center">
  <img src="public/kynd_logo.svg" alt="Kynd" width="128" />
</p>

# Kynd: AI-Powered User Testing

Automate user testing with high-fidelity AI personas. Kynd creates realistic personas, runs them through your website/app, and produces deep behavioral insights.

## 🚀 Quick Start

1. **Install Dependencies**
   ```bash
   bun install
   ```
2. **Set Environment Variables**
   Create a `.env` file with:
   - `OPENROUTER_API_KEY`
3. **Run Dev Server**
   ```bash
   bun dev
   ```

## 📖 Documentation Hub

- **[Architecture Guide](./docs/ARCHITECTURE.md)**: Rules for the Hexagonal MVP structure.
- **[Code Examples](./docs/EXAMPLES.md)**: Gold-standard implementations for common tasks.
- **[Report API](./docs/REPORT_API.md)**: JSON API endpoint for programmatic pricing analysis (ideal for test loops).
- **[Design System](./DESIGN_SYSTEM.md)**: UI/UX principles and CSS tokens.
- **[Research Foundation](./docs/RESEARCH.md)**: The "Deep Binding" science behind our personas.
- **[Product Backlog](./BACKLOG.md)**: Roadmap, current sprints, and completed tasks.

## 🛠 Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **State**: Zustand (for global state) / React Server Actions (for data)
- **Architecture**: Hexagonal (Domain-Driven Design)
- **Runtime**: Bun
