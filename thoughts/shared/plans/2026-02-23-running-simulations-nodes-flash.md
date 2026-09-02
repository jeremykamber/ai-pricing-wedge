# Implementation Plan: Running Simulations Nodes Flash Fix

**Date**: 2026-02-23  
**Issue**: Step nodes flash to "completed" state when dialog opens  
**Status**: Pending Implementation

---

## Problem Summary

When the "Running Simulations" dialog opens, all step nodes briefly flash to a "checked/completed" state for a split second before showing the correct state. This happens because:

- In `DashboardClient.tsx:98-102`, the `currentStep` calculation defaults to `3` when `analysisProgress.step` is undefined
- The `StepIndicator` component uses `isCompleted = index < currentStep`
- When `currentStep = 3`, all 3 steps (indices 0, 1, 2) appear completed

The same issue exists in the persona flow ("Synthesizing Audience" dialog) at lines 63-66.

---

## Specific Fix Implementation

### Change 1: Analysis Flow (Running Simulations)

**File**: `src/ui/dashboard/components/DashboardClient.tsx`  
**Lines**: 98-102

**Before**:
```typescript
currentStep={
  analysisFlow.analysisProgress?.step === 'STARTING' || analysisFlow.analysisProgress?.step === 'OPENING_PAGE' ? 0 :
  analysisFlow.analysisProgress?.step === 'FINDING_PRICING' ? 1 : 
  analysisFlow.analysisProgress?.step === 'THINKING' ? 2 : 3
}
```

**After**:
```typescript
currentStep={
  analysisFlow.analysisProgress?.step === 'STARTING' || analysisFlow.analysisProgress?.step === 'OPENING_PAGE' ? 0 :
  analysisFlow.analysisProgress?.step === 'FINDING_PRICING' ? 1 : 
  analysisFlow.analysisProgress?.step === 'THINKING' ? 2 : 0
}
```

### Change 2: Persona Flow (Synthesizing Audience)

**File**: `src/ui/dashboard/components/DashboardClient.tsx`  
**Lines**: 63-66

**Before**:
```typescript
currentStep={
  personaFlow.personaProgress?.step === 'BRAINSTORMING_PERSONAS' ? 0 :
  personaFlow.personaProgress?.step === 'GENERATING_BACKSTORIES' ? 1 : 2
}
```

**After**:
```typescript
currentStep={
  personaFlow.personaProgress?.step === 'BRAINSTORMING_PERSONAS' ? 0 :
  personaFlow.personaProgress?.step === 'GENERATING_BACKSTORIES' ? 1 : 0
}
```

---

## Verification Steps

1. **Run the application**: `npm run dev`
2. **Test Running Simulations flow**:
   - Start a pricing analysis
   - Observe the "Running Simulations" dialog - steps should no longer flash to completed
3. **Test Persona Generation flow**:
   - Start a persona generation
   - Observe the "Synthesizing Audience" dialog - steps should not flash to completed
4. **Verify normal operation**:
   - Complete both flows and ensure step progression works correctly (steps complete in order)

---

## Summary

- **Files modified**: 1 (`src/ui/dashboard/components/DashboardClient.tsx`)
- **Lines changed**: 2 (line 101: `3` → `0`, line 66: `2` → `0`)
- **Risk**: Low - simple default value change, no logic modification
