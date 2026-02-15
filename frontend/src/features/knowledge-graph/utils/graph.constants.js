/**
 * 知识图谱常量配置
 * 
 * 集中管理所有图表相关的默认配置和常量
 */

// 力导向模拟默认设置
export const DEFAULT_FORCE_SETTINGS = {
  linkDistance: 120,
  linkStrength: 0.3,
  chargeStrength: -800,
  chargeDistanceMax: 500,
  collisionRadius: 35,
  centerStrength: 0.1,
  xStrength: 0.05,
  yStrength: 0.05,
  alphaDecay: 0.02,
  velocityDecay: 0.3
};

// 显示设置默认值
export const DEFAULT_DISPLAY_SETTINGS = {
  showNodeLabels: true,
  showLinkLabels: true,
  labelsAfterStabilized: false,
  rafThrottle: true
};

// 节点颜色映射
export const NODE_COLORS = {
  artifact: '#1890ff',
  category: '#52c41a',
  era: '#fa8c16',
  author: '#722ed1',
  location: '#eb2f96',
  material: '#f5222d',
  default: '#666'
};

// 高亮样式配置
export const HIGHLIGHT_STYLES = {
  baseRadius: 20,
  highlightRadiusMultiplier: 1.4,
  dimRadiusMultiplier: 0.6,
  highlightFill: '#FFEA00',
  dimFill: '#d9d9d9',
  highlightOpacity: 1,
  dimOpacity: 0.55,
  defaultOpacity: 1
};

// 连线样式
export const LINK_STYLES = {
  defaultStroke: '#ccc',
  highlightStroke: '#e0e0e0',
  defaultOpacity: 1,
  highlightOpacity: 0.65
};

// 标签样式
export const LABEL_STYLES = {
  defaultFill: '#333',
  highlightFill: '#333',
  dimFill: '#999',
  defaultDy: 35,
  highlightDy: 45,
  dimDy: 25
};

// 图谱尺寸配置
export const GRAPH_DIMENSIONS = {
  defaultWidth: 1000,
  defaultHeight: 600,
  minHeight: 420,
  bottomGap: 24
};

// 缩放配置
export const ZOOM_CONFIG = {
  minScale: 0.1,
  maxScale: 4,
  zoomInFactor: 1.15,
  zoomOutFactor: 1 / 1.15,
  transitionDuration: 120,
  resetDuration: 160,
  fitViewDuration: 500
};

// 键盘快捷键配置
export const KEYBOARD_SHORTCUTS = {
  fitToView: 'f',
  resetZoom: '0',
  zoomIn: ['+', '='],
  zoomOut: ['-', '_'],
  panStep: 40
};

// 物理模拟参数限制
export const FORCE_LIMITS = {
  linkDistance: { min: 30, max: 400 },
  linkStrength: { min: 0, max: 1 },
  chargeStrength: { min: -3000, max: 0 },
  chargeDistanceMax: { min: 100, max: 2000 },
  collisionRadius: { min: 10, max: 100 },
  centerStrength: { min: 0, max: 1 },
  alphaDecay: { min: 0.001, max: 0.1 },
  velocityDecay: { min: 0.1, max: 0.9 }
};
