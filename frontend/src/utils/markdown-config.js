/**
 * Markdown Rendering Configuration
 * Feature: 002-enhance-smart-qa / US1 - Markdown格式显示
 * Purpose: Configure safe markdown rendering with XSS protection
 */

import { defaultSchema } from 'rehype-sanitize';

/**
 * Sanitize schema for rehype-sanitize
 * Allowlist-based approach to prevent XSS attacks
 */
export const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema.attributes?.code || []),
      ['className', 'hljs', 'language-*'] // Allow highlight.js classes
    ],
    span: [
      ...(defaultSchema.attributes?.span || []),
      ['className'] // Allow syntax highlighting classes
    ],
    div: [
      ...(defaultSchema.attributes?.div || []),
      ['className'] // Allow custom div classes
    ]
  },
  // Allow MathJax elements for LaTeX rendering
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'math',
    'mrow',
    'mi',
    'mo',
    'mn',
    'msup',
    'msub',
    'mfrac',
    'msqrt',
    'semantics',
    'annotation'
  ]
};

/**
 * Custom component renderers for ReactMarkdown
 */
export const markdownOptions = {
  components: {
    // Custom code block renderer
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      return !inline && match ? (
        <pre className={className}>
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    
    // Custom table renderer
    table({ children }) {
      return (
        <div className="markdown-table-wrapper">
          <table className="markdown-table">
            {children}
          </table>
        </div>
      );
    },
    
    // Custom link renderer (open in new tab)
    a({ href, children }) {
      return (
        <a 
          href={href} 
          target="_blank" 
          rel="noopener noreferrer"
        >
          {children}
        </a>
      );
    }
  }
};

/**
 * Performance configuration
 */
export const performanceConfig = {
  // Maximum content length to render (chars)
  maxContentLength: 50000,
  
  // Timeout for rendering (ms)
  renderTimeout: 3000
};

/**
 * Sanitize markdown content before rendering
 * Basic text sanitization (XSS prevention is handled by rehype-sanitize)
 * 
 * @param {string} content - Raw markdown content
 * @returns {string} Sanitized markdown content
 */
export const sanitizeMarkdown = (content) => {
  if (!content || typeof content !== 'string') {
    return '';
  }
  
  // Remove potential script injections in markdown links
  // Pattern: [text](javascript:...)
  let sanitized = content.replace(
    /\[([^\]]+)\]\(javascript:[^\)]*\)/gi,
    '[$1](#)'
  );
  
  // Remove data: URIs in images (except safe types)
  sanitized = sanitized.replace(
    /!\[([^\]]*)\]\(data:(?!image\/(png|jpg|jpeg|gif|svg\+xml))[^\)]*\)/gi,
    '![$1](#)'
  );
  
  // Remove potential XSS in HTML comments (if any leaked through)
  sanitized = sanitized.replace(
    /<!--[\s\S]*?-->/g,
    ''
  );
  
  return sanitized;
};

/**
 * Validate markdown content size
 * 
 * @param {string} content - Markdown content
 * @returns {Object} Validation result { valid: boolean, size: number, maxSize: number }
 */
export const validateContentSize = (content) => {
  const size = content ? content.length : 0;
  return {
    valid: size <= performanceConfig.maxContentLength,
    size,
    maxSize: performanceConfig.maxContentLength
  };
};

/**
 * Extract code blocks from markdown
 * Useful for debugging or logging
 * 
 * @param {string} content - Markdown content
 * @returns {Array<{language: string, code: string}>} Array of code blocks
 */
export const extractCodeBlocks = (content) => {
  if (!content) return [];
  
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const blocks = [];
  let match;
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    blocks.push({
      language: match[1] || 'text',
      code: match[2].trim()
    });
  }
  
  return blocks;
};

export default {
  sanitizeSchema,
  markdownOptions,
  sanitizeMarkdown,
  performanceConfig,
  validateContentSize,
  extractCodeBlocks
};
