---
status: resolved
trigger: "知识图谱反复重新加载"
created: 2026-05-10T12:50:00Z
updated: 2026-05-10T14:20:00Z
---

## Current Focus

hypothesis: "D3 simulation useEffect (line 321) re-runs whenever drawCanvas changes. drawCanvas changes whenever hoveredNode changes. When the effect re-runs, it stops the old simulation and creates a new one from scratch (alpha=1), causing nodes to re-animate from random positions. Additionally, old event listeners are never removed, accumulating on each re-run."
test: "Code review confirmed: (1) D3 effect deps [graphData, activeSearchKeyword, matchedNodeIds, drawCanvas], drawCanvas deps [activeSearchKeyword, matchedNodeIds, hoveredNode]. hoveredNode change -> drawCanvas recreate -> D3 effect re-run. (2) Cleanup only simulation.stop(), no removeEventListener. (3) New simulation starts with alpha=1 default."
expecting: "Confirmed: hovering over nodes triggers D3 effect re-run, restarting simulation"
next_action: "Return ROOT CAUSE FOUND diagnosis"

## Symptoms

expected: "知识图谱页面能正常加载和显示，节点和关系可见，无反复重新加载"
actual: "知识图谱反复重新加载"
errors: "无明确错误消息，页面反复刷新/重新加载"
reproduction: "进入知识图谱页面，观察图谱加载行为"
started: "Phase 1 修复后（REL-02, SEC-03 修改了 graph.py）"

## Eliminated

[none yet]

## Evidence

- timestamp: 2026-05-10T12:55:00Z
  checked: frontend/src/pages/Graph.tsx useEffect dependencies
  found: "D3 simulation effect at line 321 has deps [graphData, activeSearchKeyword, matchedNodeIds, drawCanvas]. drawCanvas (line 231) has deps [activeSearchKeyword, matchedNodeIds, hoveredNode]."
  implication: "When hoveredNode changes (on mouse hover), drawCanvas is recreated, which triggers D3 effect re-run"

- timestamp: 2026-05-10T12:56:00Z
  checked: D3 effect cleanup function
  found: "Cleanup only calls simulation.stop(). Event listeners (wheel, mousedown, mousemove, mouseup, click) added via canvas.addEventListener are NEVER removed."
  implication: "Each effect re-run adds duplicate event listeners. Old listeners remain active with stale closures."

- timestamp: 2026-05-10T12:57:00Z
  checked: Simulation initialization in D3 effect
  found: "New simulation is created with default alpha=1 (no .alpha() set). .alphaDecay(0.05) and .velocityDecay(0.4) are set, but initial alpha is 1.0."
  implication: "Every effect re-run restarts simulation from scratch, nodes fly in from random positions"

- timestamp: 2026-05-10T12:58:00Z
  checked: Backend graph.py changes (SEC-03, REL-04)
  found: "SEC-03 added ALLOWED_LABELS whitelist and validate_label(). REL-04 wrapped sync Neo4j import in run_in_threadpool. No changes to /graph/full endpoint behavior."
  implication: "Backend changes unlikely to cause frontend reload loop"

- timestamp: 2026-05-10T12:59:00Z
  checked: fetchGraph and visibleTypes effects for infinite loops
  found: "fetchGraph useCallback depends on [visibleTypes]. visibleTypes effect (line 217) depends on [visibleTypes, nodeLimit, searchKeyword, fetchGraph]. No circular dependency found."
  implication: "No infinite loop in data fetching logic"

- timestamp: 2026-05-10T13:00:00Z
  checked: API client, router, auth hooks for page reload triggers
  found: "No window.location.reload() calls. 401 handler dispatches custom event, doesn't reload page. No WebSocket/SSE in graph page."
  implication: "No external trigger causing page reload"

## Resolution

root_cause: "D3 simulation useEffect at line 321 in frontend/src/pages/Graph.tsx re-runs whenever drawCanvas changes. drawCanvas is a useCallback with dependency [hoveredNode]. When user hovers over a node, hoveredNode state changes, recreating drawCanvas, which triggers the D3 effect to re-run. The effect stops the old simulation and creates a new one with default alpha=1, causing nodes to restart animation from random positions (appearing to 'reload'). Additionally, the effect's cleanup function only calls simulation.stop() but never removes canvas event listeners (wheel, mousedown, mousemove, mouseup, click), causing them to accumulate on each re-run."
fix: ""
verification: ""
files_changed: []
