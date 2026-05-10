---
phase: 01-stop-bleeding
plan: 21
subsystem: frontend
completed: 2026-05-10
tags: [d3, canvas, performance, memory-leak]
key-files:
  created: []
  modified:
    - frontend/src/pages/Graph.tsx
dependency-graph:
  requires: []
  provides: [REL-02]
  affects: []
tech-stack:
  added: []
  patterns:
    - "useRef callback pattern for stable D3 tick handler"
    - "Named event handlers with matching removeEventListener cleanup"
decisions:
  - "Use drawCanvasRef to hold latest draw function without triggering effect re-runs"
  - "Keep hoveredNode in drawCanvas dependency array (tooltip is drawn inside drawCanvas) but call via ref in tick"
metrics:
  duration: "~5 minutes"
  tasks: 2
  files: 1
---

# Phase 01 Plan 21: Fix D3 Simulation Restart on Hover Summary

Stabilized the knowledge graph D3 force simulation so it no longer restarts on every mouse hover, and added proper canvas event listener cleanup to prevent memory leaks.

## What Changed

### Task 1: Stabilize drawCanvas and decouple tooltip from D3 effect

**Problem:** The D3 simulation `useEffect` depended on `drawCanvas`, which depended on `hoveredNode`. When the user hovered over a node, `hoveredNode` changed -> `drawCanvas` was recreated -> D3 effect re-ran -> new simulation with `alpha=1` started, causing nodes to fly in from random positions.

**Fix:**
- Added `drawCanvasRef` to hold the latest `drawCanvas` function without triggering effect re-runs
- Updated D3 `.on('tick')` to call `drawCanvasRef.current?.()` instead of the stale `drawCanvas` closure
- Removed `drawCanvas` from the D3 effect dependency array
- Removed the now-unnecessary `eslint-disable-next-line react-hooks/exhaustive-deps` comment

**Commit:** `cf5e96d`

### Task 2: Add canvas event listener cleanup

**Problem:** The cleanup function only called `simulation.stop()` but never removed the 5 canvas event listeners (wheel, mousedown, mousemove, mouseup, click). On repeated effect re-runs (e.g., when graph data changed), new listeners accumulated.

**Fix:**
- Extracted all 5 anonymous inline event listeners into named handler functions
- Added matching `canvas.removeEventListener()` calls for all 5 listeners in the effect cleanup
- Preserved identical behavior in all handlers — no logic changes

**Commit:** `78993ae`

## Verification

| Check | Result |
|-------|--------|
| `drawCanvasRef` declared with `useRef` | PASS (line 95) |
| `drawCanvasRef.current = drawCanvas` after useCallback | PASS (line 322) |
| D3 `.on('tick')` calls `drawCanvasRef.current?.()` | PASS (line 384) |
| D3 effect deps: `[graphData, activeSearchKeyword, matchedNodeIds]` | PASS (line 501) |
| `drawCanvas` NOT in D3 effect deps | PASS |
| 5 `addEventListener` calls with named handlers | PASS (lines 495-499) |
| 5 `removeEventListener` calls in cleanup | PASS (lines 506-510) |
| `simulation.stop()` remains in cleanup | PASS (line 505) |
| Frontend build succeeds | PASS (Vite build completed in 1.40s) |

## Deviations from Plan

None — plan executed exactly as written.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: mitigate | frontend/src/pages/Graph.tsx | T-01-21-01: Event listener accumulation mitigated via proper removeEventListener in cleanup |

## Self-Check: PASSED

- [x] `frontend/src/pages/Graph.tsx` modified and committed
- [x] Commit `cf5e96d` exists in git log
- [x] Commit `78993ae` exists in git log
- [x] Frontend build passes without TypeScript errors
