---
date: 2026-07-15
topic: "Screenshot Upload for Pricing Page Analysis"
status: validated
---

## Problem Statement

Users want to evaluate pricing pages **before they're live** — wireframes, designs, prototypes. Currently the pipeline only accepts live URLs (Playwright scrapes them). This feature adds screenshot/image as an alternative input source.

## Key Insight

**The backend already supports this.** The entire image upload path is wired end-to-end:

- `useAnalysisFlow` hook: has `pricingImageBase64` state + `setPricingImageBase64` setter
- `handleAnalyzePricing`: sends `imageBase64` through to the server action
- `ParsePricingPageUseCase.execute()`: line 66-70 detects `options.imageBase64`, skips browser entirely, uses image as `capturedScreenshot` with empty `pageHtml`
- `validatePricingAnalysis()`: accepts `url === "Manual Upload"` as valid

**Nobody calls `setPricingImageBase64`.** The only missing piece is a UI component.

## Constraints

- Single image only (PNG, JPG, WEBP) — no multi-image, no PDF, no Figma
- No server-side storage — base64 in memory, same as Playwright screenshots
- No new server actions or API routes — reuse existing `analyzePricingPageAction`
- Keep the downstream pipeline unchanged — vision model gets the image, personas analyze it

## Approach

Add a **two-mode input toggle** to the `NewSimulationForm` on the simulations page.

### Current Flow

```
User enters URL → Playwright scrapes → Vision model → Personas
```

### New Flow

```
User enters URL         → Playwright scrapes → Vision model → Personas
User uploads screenshot → (skip browser)    → Vision model → Personas
```

Both paths converge at the same point — the vision model receives a base64 screenshot and analyzes it per persona.

## Architecture

### What Changes

**One file**: `src/app/(app)/dashboard/simulations/page.tsx` — `NewSimulationForm` component

- Replace the single URL `<Input>` with a segmented control: `[ URL | Screenshot ]`
- URL mode: existing `<Input type="url">` (unchanged behavior)
- Screenshot mode: a drop zone / file input area
- On file select: validate type, convert to base64 via `FileReader.readAsDataURL()`, store in `pricingImageBase64`
- On submit: pass `url = "Manual Upload"` + the base64 string to `handleRunSimulation`

### What Doesn't Change

- `useAnalysisFlow` hook — already has the state and logic
- `analyzePricingPageAction` — already accepts optional `imageBase64`
- `ParsePricingPageUseCase` — already skips browser when image is provided
- `VisionAnalysisAdapter` — already handles base64 images
- Persona analysis — already works with screenshot-only input

### Data Flow

```
NewSimulationForm
  ├── URL mode: url string → handleRunSimulation(url, personas)
  └── Screenshot mode: File → FileReader.readAsDataURL() → base64 string
      → handleRunSimulation("Manual Upload", personas, imageBase64)

handleRunSimulation (in page.tsx)
  → analysisFlow.setPricingUrl(url)
  → imageBase64 && analysisFlow.setPricingImageBase64(imageBase64)
  → analysisFlow.handleAnalyzePricing(personas, url)

useAnalysisFlow.handleAnalyzePricing
  → analyzePricingPageAction(url, personas, requestId, imageBase64)

ParsePricingPageUseCase.execute(url, personas, ..., { imageBase64 })
  → IF imageBase64: skip browser, use image as capturedScreenshot, pageHtml = ""
  → ELSE: full Playwright scouting flow (unchanged)

Persona analysis (unchanged)
  → VisionAnalysisAdapter.analyzePricingPageCompletion(persona, screenshot, html)
  → streamObject() with vision model → PricingAnalysis per persona
```

## UI Design

### Segmented Control

Two options side by side:
- **URL** — shows the existing URL input field
- **Screenshot** — shows a drop zone

### Drop Zone

- Dashed border, centered icon + text ("Drop a screenshot or click to browse")
- Accepts: `image/png`, `image/jpeg`, `image/webp`
- On drag-over: visual highlight
- On file select: show filename + preview thumbnail + "Remove" button
- Validation: reject files > 10MB, reject non-image types

### Submit Button Behavior

- Disabled until: (URL mode AND valid URL) OR (Screenshot mode AND image selected)
- Loading state unchanged

## Error Handling

- **Wrong file type**: show inline validation message, don't add to state
- **File too large**: show inline message (cap at 10MB)
- **Browser FileReader fails**: catch error, show generic message
- No new error states needed in the pipeline — the use case already handles the image path

## Testing Strategy

- Manual: upload a PNG screenshot of a known pricing page, run simulation, verify results match URL-based analysis
- Edge cases: very small image, very large image, non-standard aspect ratio
- Regression: URL mode must work identically to before

## Open Questions

- **HTML context**: When using a screenshot, `pageHtml` is empty. Persona analyses receive only the image. The vision model should handle this fine, but worth monitoring if users report less detailed text-based feedback.
- **Image quality**: Playwright captures at JPEG quality 40, 1280x800 viewport. User uploads may be higher resolution. Should we resize/compress before sending to the vision model? For v1, no — let it through as-is.
