# Screenshot Upload for Pricing Page Analysis

**Goal:** Add a two-mode input (URL / Screenshot) to the NewSimulationForm so users can upload a screenshot instead of providing a live URL.

**Architecture:** The entire backend pipeline already handles image uploads — `useAnalysisFlow` has `pricingImageBase64` state, `handleAnalyzePricing` sends it through to the server action, and `ParsePricingPageUseCase` skips Playwright when an image is provided. The only work is UI (the form) and a small parameter addition to avoid a React state race condition.

**Design:** `thoughts/shared/designs/2026-07-15-screenshot-upload-design.md`

---

## Race Condition

`handleRunSimulation` calls `analysisFlow.setPricingImageBase64(data)` then `analysisFlow.handleAnalyzePricing(personas, url)` in the same event handler. React batches state updates — the new `pricingImageBase64` value won't be committed when `handleAnalyzePricing` reads it.

**Fix:** Add an optional `overrideImageBase64` parameter to `handleAnalyzePricing`, mirroring the existing `overrideUrl` pattern. This is a 3-line change to `useAnalysisFlow.ts`.

---

## Dependency Graph

```
Batch 1 (parallel): 1.1, 1.2
Batch 2 (parallel): 2.1 (integration - depends on both)
```

---

## Batch 1: Foundation (parallel — 2 implementers)

### Task 1.1: Add overrideImageBase64 to handleAnalyzePricing

**File:** `src/ui/hooks/useAnalysisFlow.ts`
**Test:** `tests/ui/hooks/useAnalysisFlow.test.ts` (create if absent, otherwise skip — this hook requires a browser environment for testing; verify manually)
**Depends:** none

This avoids the React state batching race condition where `setPricingImageBase64` hasn't committed by the time `handleAnalyzePricing` reads `pricingImageBase64`.

**Change 1 — function signature (line 61):**

```typescript
// Before:
const handleAnalyzePricing = (personas: Persona[], overrideUrl?: string) => {

// After:
const handleAnalyzePricing = (personas: Persona[], overrideUrl?: string, overrideImageBase64?: string) => {
```

**Change 2 — derive activeImage (after line 64):**

```typescript
// Before:
const activeUrl = overrideUrl?.trim() || pricingUrl.trim()

// After:
const activeUrl = overrideUrl?.trim() || pricingUrl.trim()
const activeImage = overrideImageBase64 ?? pricingImageBase64
```

**Change 3 — replace `pricingImageBase64` reads with `activeImage` (lines 65, 77, 113, 116):**

Four occurrences. Replace all `pricingImageBase64` with `activeImage` in these lines:

- Line 65: `if (!activeUrl && !pricingImageBase64)` → `if (!activeUrl && !activeImage)`
- Line 77: `imageBase64=${pricingImageBase64 ? ...}` → `imageBase64=${activeImage ? ...}`
- Line 113: `const urlToUse = pricingImageBase64 ? ...` → `const urlToUse = activeImage ? ...`
- Line 116: `...pricingImageBase64 || undefined)` → `...activeImage || undefined)`

**Verify:** `bun run typecheck` (this hook is hard to unit test without a full browser env)
**Commit:** `fix(analysis): add overrideImageBase64 param to handleAnalyzePricing`

---

### Task 1.2: Update NewSimulationForm with segmented control, drop zone, and image handling

**File:** `src/app/(app)/dashboard/simulations/page.tsx`
**Test:** none (manual verification — this is a UI-only form change)
**Depends:** none

This is the main deliverable. All changes are within the `NewSimulationForm` function (lines 140–209).

#### 1.2.1: New imports (top of file, after line 14)

Add to the existing lucide-react import:

```typescript
import { ClockIcon, GlobeIcon, UsersIcon, CheckCircleIcon, XCircleIcon, AlertCircleIcon, XIcon, PlusIcon, UploadIcon, ImageIcon, LinkIcon } from 'lucide-react'
```

Add `useCallback` and `useRef` to the React import:

```typescript
import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
```

#### 1.2.2: New state variables (inside NewSimulationForm, after line 143)

```typescript
const [inputMode, setInputMode] = useState<'url' | 'screenshot'>('url')
const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
const [imageBase64, setImageBase64] = useState<string | null>(null)
const [validationError, setValidationError] = useState<string | null>(null)
const [isDragOver, setIsDragOver] = useState(false)
const fileInputRef = useRef<HTMLInputElement>(null)
const imageBase64Ref = useRef<string | null>(null)
```

The `imageBase64Ref` is critical: it holds the base64 value in sync outside React state, so `handleSubmit` can read the latest value without race conditions.

#### 1.2.3: File validation + FileReader logic (after state declarations)

```typescript
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

const validateAndReadFile = useCallback((file: File) => {
  setValidationError(null)

  if (!ACCEPTED_TYPES.includes(file.type as any)) {
    setValidationError('Only PNG, JPG, and WEBP images are accepted.')
    return
  }
  if (file.size > MAX_SIZE_BYTES) {
    setValidationError('Image must be under 10 MB.')
    return
  }

  setScreenshotFile(file)
  setScreenshotPreview(URL.createObjectURL(file))

  const reader = new FileReader()
  reader.onload = () => {
    const result = reader.result as string
    setImageBase64(result)
    imageBase64Ref.current = result
  }
  reader.onerror = () => {
    setValidationError('Failed to read file. Please try again.')
  }
  reader.readAsDataURL(file)
}, [])
```

#### 1.2.4: Drag-and-drop handlers (after validateAndReadFile)

```typescript
const handleDragOver = useCallback((e: React.DragEvent) => {
  e.preventDefault()
  setIsDragOver(true)
}, [])

const handleDragLeave = useCallback((e: React.DragEvent) => {
  e.preventDefault()
  setIsDragOver(false)
}, [])

const handleDrop = useCallback((e: React.DragEvent) => {
  e.preventDefault()
  setIsDragOver(false)
  const file = e.dataTransfer.files[0]
  if (file) validateAndReadFile(file)
}, [validateAndReadFile])

const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (file) validateAndReadFile(file)
}, [validateAndReadFile])

const removeScreenshot = useCallback(() => {
  setScreenshotFile(null)
  setScreenshotPreview(null)
  setImageBase64(null)
  imageBase64Ref.current = null
  setValidationError(null)
  if (fileInputRef.current) fileInputRef.current.value = ''
}, [])
```

#### 1.2.5: Update `handleSubmit` (replace lines 154–157)

```typescript
const handleSubmit = () => {
  if (!selectedBatch) return

  if (inputMode === 'url') {
    if (!url.trim()) return
    onRun(url, selectedBatch.personas)
  } else {
    if (!imageBase64Ref.current) return
    onRun('Manual Upload', selectedBatch.personas, imageBase64Ref.current)
  }
}
```

Note: We use `imageBase64Ref.current` instead of `imageBase64` state to avoid any stale closure issues.

#### 1.2.6: Update `onRun` prop type (line 140)

```typescript
// Before:
function NewSimulationForm({ onRun }: { onRun: (url: string, personas: Persona[]) => void }) {

// After:
function NewSimulationForm({ onRun }: { onRun: (url: string, personas: Persona[], imageBase64?: string) => void }) {
```

#### 1.2.7: Replace the URL input section (lines 190–199) with segmented control + mode-specific content

```tsx
{/* ── Input mode toggle ──────────────────────────────────── */}
<div className="flex flex-col gap-2">
  <div className="flex gap-1 rounded-lg bg-muted p-1">
    <button
      type="button"
      onClick={() => setInputMode('url')}
      className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        inputMode === 'url'
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <LinkIcon className="h-3.5 w-3.5" />
      URL
    </button>
    <button
      type="button"
      onClick={() => setInputMode('screenshot')}
      className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        inputMode === 'screenshot'
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <ImageIcon className="h-3.5 w-3.5" />
      Screenshot
    </button>
  </div>

  {inputMode === 'url' ? (
    /* ── URL mode ──────────────────────────────────────── */
    <div className="flex flex-col gap-2">
      <label htmlFor="pricing-url" className="text-sm font-medium">Pricing Page URL</label>
      <Input
        id="pricing-url"
        type="url"
        placeholder="https://your-startup.com/pricing"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
    </div>
  ) : (
    /* ── Screenshot mode ──────────────────────────────── */
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">Pricing Page Screenshot</label>
      {!screenshotFile ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-sm text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground cursor-pointer ${
            isDragOver ? 'border-primary bg-primary/5' : ''
          }`}
        >
          <UploadIcon className="h-6 w-6" />
          Drop a screenshot or click to browse
          <span className="text-xs text-muted-foreground/70">PNG, JPG, or WEBP — under 10 MB</span>
        </button>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border p-3">
          {screenshotPreview && (
            <img
              src={screenshotPreview}
              alt="Screenshot preview"
              className="h-14 w-14 rounded object-cover"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{screenshotFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {(screenshotFile.size / 1024).toFixed(0)} KB
            </p>
          </div>
          <button
            type="button"
            onClick={removeScreenshot}
            className="rounded-md p-1 text-muted-foreground hover:text-destructive transition-colors"
            aria-label="Remove screenshot"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileInput}
        className="hidden"
      />
      {validationError && (
        <p className="text-xs text-destructive">{validationError}</p>
      )}
    </div>
  )}
</div>
```

#### 1.2.8: Update submit button disabled logic (replace lines 200–205)

```tsx
<Button
  disabled={
    inputMode === 'url'
      ? !url.trim()
      : !imageBase64Ref.current
  }
  onClick={handleSubmit}
>
  Run Simulation
</Button>
```

**Verify:** `bun run typecheck` then `bun dev` and test both modes manually
**Commit:** `feat(simulations): add screenshot upload to simulation form`

---

## Batch 2: Integration (parallel — 1 implementer)

### Task 2.1: Update handleRunSimulation in SimulationsPage

**File:** `src/app/(app)/dashboard/simulations/page.tsx`
**Test:** none
**Depends:** 1.1, 1.2

#### 2.1.1: Update `handleRunSimulation` signature and body (lines 219–223)

```typescript
// Before:
const handleRunSimulation = (url: string, personas: Persona[]) => {
  analysisFlow.setPricingUrl(url)
  analysisFlow.handleAnalyzePricing(personas, url)
  setShowNewForm(false)
}

// After:
const handleRunSimulation = (url: string, personas: Persona[], imageBase64?: string) => {
  if (imageBase64) {
    analysisFlow.setPricingImageBase64(imageBase64)
  }
  analysisFlow.setPricingUrl(url)
  analysisFlow.handleAnalyzePricing(personas, url, imageBase64)
  setShowNewForm(false)
}
```

Key: `setPricingImageBase64` is called for state consistency (so the hook's state reflects the image if anything reads it later), but the actual value passed to `handleAnalyzePricing` via the override parameter avoids the race condition.

**Verify:** `bun run typecheck`
**Commit:** included in `feat(simulations): add screenshot upload to simulation form`

---

## Summary of Changes

| File | Change | Lines affected |
|------|--------|---------------|
| `src/ui/hooks/useAnalysisFlow.ts` | Add `overrideImageBase64` param, derive `activeImage` | ~5 lines |
| `src/app/(app)/dashboard/simulations/page.tsx` | New imports, new state, segmented control, drop zone, file validation, updated submit logic, updated `handleRunSimulation` | ~120 lines added/modified |

**Total scope:** 2 files, ~125 lines changed. No new components, no new server actions, no new stores.

## Manual Verification Checklist

1. **URL mode unchanged:** Enter a valid URL → Run Simulation → works exactly as before
2. **Screenshot mode:** Toggle to Screenshot → drag-and-drop a PNG → see preview → Run Simulation → analysis runs
3. **File validation:** Try uploading a .pdf → see error. Try uploading a >10MB image → see error.
4. **Remove screenshot:** Click X → drop zone returns, submit button re-disables
5. **Switch modes:** Start with URL, switch to screenshot, switch back → URL input is intact
6. **Disabled states:** Submit disabled with empty URL, disabled with no screenshot selected
