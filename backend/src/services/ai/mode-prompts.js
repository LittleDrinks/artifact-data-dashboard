/**
 * Mode Prompts Configuration
 * 三种问答模式的系统提示词配置
 */

const { createLogger } = require('../../utils/logger');

const logger = createLogger('ModePrompts');

// 问答模式类型
const CHAT_MODES = {
  GRAPH: 'graph',           // 图谱模式
  KNOWLEDGE: 'knowledge',   // 知识模式
  GENERAL: 'general'        // 通用模式
};

/**
 * 构建系统提示词基础规则
 * @returns {string} 基础规则文本
 */
function buildBaseRules() {
  return [
    '你是一个文物领域的专业智能助手。',
    '只输出中文。',
    '避免使用英文单词；如不可避免，请用中文解释。',
    '严禁输出任何代码、函数调用、JSON、HTML、Markdown 代码块。',
    '严禁输出类似 loadData(\'q\') / fetch(...) 等伪函数调用。'
  ].join('\n');
}

/**
 * 获取图谱模式 (graph) 的系统提示词
 * 强制 AI 必须调用 query_graph 工具查询知识图谱
 * @returns {string} 系统提示词
 */
function getGraphModePrompt() {
  const baseRules = buildBaseRules();
  
  const modeSpecificRules = [
    '',
    '【图谱模式规则】',
    '1. 你必须调用 query_graph 工具查询知识图谱来获取信息。',
    '2. 只回答图谱中存在的事实，不要基于训练数据推测。',
    '3. 如果查询结果不足以回答问题，明确告知用户"根据现有数据无法确定"。',
    '4. 如果图谱中没有相关信息，明确告知用户"知识图谱中未找到相关信息"。',
    '5. 回答时优先引用图谱中的实体名称和关系。',
    '6. 对于不确定的信息，使用"根据现有数据..."开头。',
    '7. 严禁编造不存在的实体、关系或属性。'
  ].join('\n');

  return baseRules + modeSpecificRules;
}

/**
 * 获取知识模式 (knowledge) 的系统提示词
 * 基于图谱实例归纳总结通用知识
 * @returns {string} 系统提示词
 */
function getKnowledgeModePrompt() {
  const baseRules = buildBaseRules();
  
  const modeSpecificRules = [
    '',
    '【知识模式规则】',
    '1. 首先调用 query_graph 工具查询知识图谱，获取相关的文物实例。',
    '2. 基于查询到的具体文物实例，归纳总结通用知识。',
    '3. 回答时必须引用具体实例作为证据支撑。',
    '4. 使用"例如..."、"如...所示"等方式引用实例。',
    '5. 如果图谱中没有相关实例，回答"缺乏足够实例支持结论"。',
    '6. 在实例基础上，可以适当补充合理的专业推断，但需注明"基于专业推断"。',
    '7. 区分"事实"和"推断"，事实来自图谱，推断需明确标注。'
  ].join('\n');

  return baseRules + modeSpecificRules;
}

/**
 * 获取通用模式 (general) 的系统提示词
 * AI 可以基于训练数据自由回答
 * @returns {string} 系统提示词
 */
function getGeneralModePrompt() {
  const baseRules = buildBaseRules();
  
  const modeSpecificRules = [
    '',
    '【通用模式规则】',
    '1. 你可以基于训练数据自由回答用户问题。',
    '2. 如果问题涉及具体馆藏文物，建议调用 query_graph 或 search_artifacts 工具核实。',
    '3. 明确区分"通用知识"和"具体馆藏信息"：',
    '   - 通用知识：来自训练数据，无需特别标注',
    '   - 具体馆藏信息：必须说明数据来源（如"根据知识图谱..."）',
    '4. 当被问及具体文物细节时，优先使用工具查询验证。',
    '5. 如果工具查询结果与训练数据冲突，以工具查询结果为准。',
    '6. 鼓励用户深入探索，提供相关但不过度的背景信息。'
  ].join('\n');

  return baseRules + modeSpecificRules;
}

/**
 * 根据模式获取对应的系统提示词
 * @param {string} mode - 问答模式 (graph | knowledge | general)
 * @returns {string} 系统提示词
 */
function getSystemPromptByMode(mode) {
  switch (mode) {
    case CHAT_MODES.GRAPH:
      return getGraphModePrompt();
    case CHAT_MODES.KNOWLEDGE:
      return getKnowledgeModePrompt();
    case CHAT_MODES.GENERAL:
      return getGeneralModePrompt();
    default:
      logger.warn(`[ModePrompts] 未知的问答模式: ${mode}，使用默认知识模式`);
      return getKnowledgeModePrompt();
  }
}

/**
 * 获取模式描述信息
 * @param {string} mode - 问答模式
 * @returns {Object} 模式描述
 */
function getModeDescription(mode) {
  const descriptions = {
    [CHAT_MODES.GRAPH]: {
      name: '图谱模式',
      description: '严格基于知识图谱回答，只回答图谱中存在的事实',
      features: ['强制查询图谱', '只回答已知事实', '不确定时明确告知'],
      recommendedFor: ['验证具体信息', '查询文物关系', '确认馆藏细节']
    },
    [CHAT_MODES.KNOWLEDGE]: {
      name: '知识模式',
      description: '基于图谱实例归纳总结通用知识，引用实例作为证据',
      features: ['查询实例', '归纳总结', '引用证据'],
      recommendedFor: ['了解文物类型', '研究历史背景', '探索文化知识']
    },
    [CHAT_MODES.GENERAL]: {
      name: '通用模式',
      description: '基于训练数据自由回答，可辅助工具验证',
      features: ['自由回答', '工具辅助', '知识扩展'],
      recommendedFor: ['一般性咨询', '概念解释', '开放式问题']
    }
  };

  return descriptions[mode] || descriptions[CHAT_MODES.KNOWLEDGE];
}

/**
 * 获取所有可用模式列表
 * @returns {Array} 模式列表
 */
function getAllModes() {
  return [
    {
      id: CHAT_MODES.GRAPH,
      ...getModeDescription(CHAT_MODES.GRAPH)
    },
    {
      id: CHAT_MODES.KNOWLEDGE,
      ...getModeDescription(CHAT_MODES.KNOWLEDGE)
    },
    {
      id: CHAT_MODES.GENERAL,
      ...getModeDescription(CHAT_MODES.GENERAL)
    }
  ];
}

/**
 * 验证模式是否有效
 * @param {string} mode - 模式名称
 * @returns {boolean} 是否有效
 */
function isValidMode(mode) {
  return Object.values(CHAT_MODES).includes(mode);
}

module.exports = {
  CHAT_MODES,
  getGraphModePrompt,
  getKnowledgeModePrompt,
  getGeneralModePrompt,
  getSystemPromptByMode,
  getModeDescription,
  getAllModes,
  isValidMode
};
