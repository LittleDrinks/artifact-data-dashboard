function stripCodeFences(text = '') {
  return String(text)
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();
}

function safeJsonParse(raw, options = {}) {
  const text = stripCodeFences(raw);
  try {
    const value = JSON.parse(text);
    return { ok: true, value, error: null };
  } catch (error) {
    const fallback = options.fallback !== undefined ? options.fallback : null;
    return { ok: false, value: fallback, error };
  }
}

module.exports = {
  safeJsonParse,
  stripCodeFences
};
