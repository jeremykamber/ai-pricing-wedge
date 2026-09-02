# Research: Running Simulations Nodes Flash Issue

**Date**: 2026-02-23  
**Issue**: When the Running Simulations dialog opens, all step nodes briefly flash to "checked/completed" state for a split second before showing the correct state.

---

## Summary

The issue is in the `currentStep` calculation in `DashboardClient.tsx`. When `analysisProgress.step` doesn't match any expected values (defaults to `undefined` or invalid values), the calculation returns `3`, causing all 3 steps to appear completed since `isCompleted = index < currentStep`.

---

## Root Cause

**File**: `src/ui/dashboard/components/DashboardClient.tsx`  
**Lines**: 98-102

```typescript
currentStep={
  analysisFlow.analysisProgress?.step === 'STARTING' || analysisFlow.analysisProgress?.step === 'OPENING_PAGE' ? 0 :
  analysisFlow.analysisProgress?.step === 'FINDING_PRICING' ? 1 : 
  analysisFlow.analysisProgress?.step === 'THINKING' ? 2 : 3
}
```

**Problem**: When `analysisProgress?.step` is `undefined` or any value not in the list, `currentStep` defaults to `3`. Since `StepIndicator` uses `isCompleted = index < currentStep`:

- Step 0 (index 0): `0 < 3` = **true** (shows as completed ✓)
- Step 1 (index 1): `1 < 3` = **true** (shows as completed ✓)
- Step 2 (index 2): `2 < 3` = **true** (shows as completed ✓)

This causes all steps to appear checked simultaneously.

---

## When Does the Flash Occur?

The flash happens during the brief window when:

1. **Initial state**: When `handleAnalyzePricing` is called, line 53 in `useAnalysisFlow.ts` sets `analysisProgress` to `{ step: 'STARTING' }`:
   ```typescript
   // src/ui/hooks/useAnalysisFlow.ts:53
   setAnalysisProgress({ step: 'STARTING' })
   ```

2. **Server action delay**: The `analyzePricingPageAction` server action (line 20 in `analyzePricingPage.ts`) creates a stream with `{ step: "STARTING" }`. There's a timing gap where:
   - The client has set local state to `{ step: 'STARTING' }` 
   - But the server stream hasn't been read yet to confirm the step

3. **Race condition**: The React state update at line 53 runs before `startTransition`, but the dialog rendering reads `analysisProgress.step` which could briefly be undefined during React's batching/render cycle.

---

## Step Flow Analysis

**Valid steps from `ParsePricingPageUseCase.ts` (lines 10-14)**:
```typescript
export type PricingAnalysisProgressStep =
  | 'STARTING'
  | 'OPENING_PAGE'
  | 'FINDING_PRICING'
  | 'THINKING';
```

**Mapping in `DashboardClient.tsx`**:
| Step | currentStep value |
|------|-------------------|
| 'STARTING' | 0 |
| 'OPENING_PAGE' | 0 |
| 'FINDING_PRICING' | 1 |
| 'THINKING' | 2 |
| undefined/null | **3 (BUG)** |

---

## Related Code Locations

### 1. FlowDialog component
- **File**: `src/components/custom/FlowDialog.tsx`
- **Lines**: 56-59 - Passes `currentStep` to StepIndicator

### 2. StepIndicator component  
- **File**: `src/components/custom/StepIndicator.tsx`
- **Lines**: 15-17 - Determines completed state:
  ```typescript
  const isCompleted = index < currentStep;
  const isCurrent = index === currentStep;
  ```

### 3. Analysis progress state
- **File**: `src/ui/hooks/useAnalysisFlow.ts`
- **Line 28**: Initial state `null`
- **Line 53**: Sets initial step to `'STARTING'`

### 4. Server action emits steps
- **File**: `src/actions/analyzePricingPage.ts`
- **Line 20**: Initial stream value `{ step: "STARTING" }`
- **Lines 83-84** in `ParsePricingPageUseCase.ts`: Maps browser status to steps

---

## Is This Related to Persona Generation Flow?

**No** - This is specifically an issue with the **analysis flow** (Running Simulations).

The persona generation flow (`Synthesizing Audience` dialog) has a similar pattern in `DashboardClient.tsx` lines 63-66:

```typescript
currentStep={
  personaFlow.personaProgress?.step === 'BRAINSTORMING_PERSONAS' ? 0 :
  personaFlow.personaProgress?.step === 'GENERATING_BACKSTORIES' ? 1 : 2
}
```

However, the persona flow uses different step names (`BRAINSTORMING_PERSONAS`, `GENERATING_BACKSTORIES`) and would have the same bug if any unexpected step value were passed.

---

## Recommended Fix

Change the default case from `3` to `0` to ensure the first step is shown as current (not completed) when the step is undefined:

```typescript
currentStep={
  analysisFlow.analysisProgress?.step === 'STARTING' || analysisFlow.analysisProgress?.step === 'OPENING_PAGE' ? 0 :
  analysisFlow.analysisProgress?.step === 'FINDING_PRICING' ? 1 : 
  analysisFlow.analysisProgress?.step === 'THINKING' ? 2 : 
  0  // Default to first step as current, not completed
}
```

Alternatively, explicitly handle undefined/null:
```typescript
currentStep={
  analysisFlow.analysisProgress?.step === 'STARTING' || analysisFlow.analysisProgress?.step === 'OPENING_PAGE' ? 0 :
  analysisFlow.analysisProgress?.step === 'FINDING_PRICING' ? 1 : 
  analysisFlow.analysisProgress?.step === 'THINKING' ? 2 : 
  (analysisFlow.analysisProgress?.step ? 2 : 0)  // If step exists but unrecognized, show last step; if no step, show first
}
```

---

## Additional Notes

- There's also an unhandled browser status `'PROCESSING'` in `RemotePlaywrightAdapter.ts` (line 306, 313) that could emit from `captureScreenshot`, though it's not used in the current analysis flow.
- The persona flow would benefit from the same fix for consistency.
