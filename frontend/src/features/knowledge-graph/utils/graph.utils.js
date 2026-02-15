export const normalizeType = (type) => {
  const key = (type == null ? '' : String(type)).trim();
  return key ? key.toLowerCase() : 'node';
};

export const getNodeColor = (type) => {
  const colorMap = {
    artifact: '#1890ff',
    category: '#52c41a',
    era: '#fa8c16',
    author: '#722ed1',
    location: '#eb2f96',
    material: '#f5222d'
  };
  return colorMap[type] || '#666';
};

export const applyTypeLimits = (raw, limits, normalizeTypeFn, focusNodeId = null) => {
  const rawNodes = raw?.nodes || [];
  const rawEdges = raw?.edges || [];
  if (!rawNodes.length) return { nodes: [], edges: [] };

  const adjacency = new Map();
  const addNeighbor = (a, b) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a).add(b);
  };
  for (const e of rawEdges) {
    addNeighbor(String(e.source), String(e.target));
    addNeighbor(String(e.target), String(e.source));
  }

  const priorityIds = new Set();
  const focusId = focusNodeId ? String(focusNodeId) : null;
  if (focusId) priorityIds.add(focusId);

  for (const id of Array.from(priorityIds)) {
    const neighbors = adjacency.get(id);
    if (!neighbors) continue;
    for (const nb of neighbors) priorityIds.add(String(nb));
  }

  const counts = new Map();
  const kept = [];
  const keptIds = new Set();

  const getLimit = (type) => {
    const key = normalizeTypeFn(type);
    const v = limits?.[key];
    if (v === null || v === undefined) return null;
    const num = Number(v);
    if (!Number.isFinite(num)) return null;
    return Math.max(0, Math.floor(num));
  };

  for (const n of rawNodes) {
    const id = String(n.id);
    const type = normalizeTypeFn(n.type);
    const limit = getLimit(type);

    if (priorityIds.has(id)) {
      kept.push(n);
      keptIds.add(id);
      counts.set(type, (counts.get(type) || 0) + 1);
      continue;
    }

    if (limit === null) {
      kept.push(n);
      keptIds.add(id);
      counts.set(type, (counts.get(type) || 0) + 1);
      continue;
    }

    if (limit === 0) continue;

    const current = counts.get(type) || 0;
    if (current >= limit) continue;
    kept.push(n);
    keptIds.add(id);
    counts.set(type, current + 1);
  }

  const filteredEdges = rawEdges.filter(e => keptIds.has(String(e.source)) && keptIds.has(String(e.target)));

  const degree = new Map();
  for (const e of filteredEdges) {
    const s = String(e.source);
    const t = String(e.target);
    degree.set(s, (degree.get(s) || 0) + 1);
    degree.set(t, (degree.get(t) || 0) + 1);
  }
  const finalNodes = kept.filter(n => {
    const id = String(n.id);
    if (priorityIds.has(id)) return true;
    return (degree.get(id) || 0) > 0;
  });

  return { nodes: finalNodes, edges: filteredEdges };
};

export const normalizeIdList = (ids) => {
  if (!Array.isArray(ids)) return [];
  const uniq = [];
  const seen = new Set();
  for (const raw of ids) {
    const id = raw == null ? '' : String(raw);
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    uniq.push(id);
  }
  return uniq;
};

export const deriveSearchHighlights = (kw, nodes) => {
  const text = (kw || '').trim();
  if (!text) return [];
  const lowered = text.toLowerCase();
  const ids = [];
  for (const n of (nodes || [])) {
    const label = (n?.label || '').toString();
    const isMatch = label.toLowerCase().includes(lowered);
    if (isMatch) ids.push(String(n.id));
  }
  if (ids.length > 0) return ids;
  return (nodes || []).filter(n => n?.type === 'artifact').map(n => String(n.id));
};
