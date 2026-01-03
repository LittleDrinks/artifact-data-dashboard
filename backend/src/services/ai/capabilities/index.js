const sanitizeText = (text) => {
  if (text === null || text === undefined) {
    return '';
  }
  return String(text)
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
};

const applyInputCapabilities = ({ question, context, capabilities }) => {
  const sanitizeEnabled = Boolean(capabilities?.sanitize?.enabled);
  if (!sanitizeEnabled) {
    return { question, context };
  }
  return {
    question: sanitizeText(question),
    context: sanitizeText(context)
  };
};

module.exports = {
  applyInputCapabilities
};
