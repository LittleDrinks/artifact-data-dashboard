/**
 * Markdown Security Configuration
 * Feature: 002-enhance-smart-qa / US1 - Markdown格式显示
 * Purpose: Configure rehype-sanitize whitelist to prevent XSS attacks
 */

import { defaultSchema } from 'rehype-sanitize';

/**
 * Custom sanitize schema with extended whitelist
 * Allows safe HTML elements and attributes for rich markdown rendering
 */
export const sanitizeSchema = {
  ...defaultSchema,
  
  // Allow additional safe tags
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'math',        // For mathematical expressions
    'semantics',   // MathML semantics
    'mrow',        // MathML row
    'msup',        // MathML superscript
    'mi',          // MathML identifier
    'mn',          // MathML number
    'mo',          // MathML operator
    'mfrac',       // MathML fraction
    'msqrt',       // MathML square root
    'annotation',  // MathML annotation
  ],
  
  // Extended attributes for safe elements
  attributes: {
    ...defaultSchema.attributes,
    
    // Allow classes for code highlighting
    code: [
      ...(defaultSchema.attributes?.code || []),
      'className'
    ],
    pre: [
      ...(defaultSchema.attributes?.pre || []),
      'className'
    ],
    div: [
      ...(defaultSchema.attributes?.div || []),
      'className'
    ],
    span: [
      ...(defaultSchema.attributes?.span || []),
      'className'
    ],
    
    // Allow inline styles for math rendering (controlled)
    math: ['xmlns', 'display'],
    
    // Allow table alignment attributes
    td: [
      ...(defaultSchema.attributes?.td || []),
      'align'
    ],
    th: [
      ...(defaultSchema.attributes?.th || []),
      'align'
    ],
    
    // Allow target="_blank" for external links (with rel="noopener noreferrer")
    a: [
      ...(defaultSchema.attributes?.a || []),
      'target',
      'rel'
    ]
  },
  
  // Protocol whitelist for links (no javascript:)
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto', '#'],
    src: ['http', 'https']
  },
  
  // Strip dangerous attributes
  strip: ['script', 'style', 'iframe', 'object', 'embed']
};

/**
 * Markdown rendering options
 */
export const markdownOptions = {
  // Enable GitHub Flavored Markdown features
  remarkPlugins: [], // Will be populated in component
  
  // Enable sanitization with custom schema
  rehypePlugins: [], // Will be populated in component
  
  // Component overrides for custom rendering
  components: {
    // Open external links in new tab with security
    a: ({ node, ...props }) => {
      const href = props.href || '';
      const isExternal = href.startsWith('http://') || href.startsWith('https://');
      
      if (isExternal) {
        return (
          <a
            {...props}
            target="_blank"
            rel="noopener noreferrer"
            className="markdown-link external"
          />
        );
      }
      
      return <a {...props} className="markdown-link" />;
    },
    
    // Custom code block rendering with language detection
    code: ({ node, inline, className, children, ...props }) => {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';
      
      if (inline) {
        return (
          <code className="markdown-inline-code" {...props}>
            {children}
          </code>
        );
      }
      
      return (
        <code
          className={`markdown-code-block ${className || ''}`}
          data-language={language}
          {...props}
        >
          {children}
        </code>
      );
    },
    
    // Custom table rendering
    table: ({ node, ...props }) => (
      <div className="markdown-table-wrapper">
        <table className="markdown-table" {...props} />
      </div>
    ),
    
    // Custom blockquote rendering
    blockquote: ({ node, ...props }) => (
      <blockquote className="markdown-blockquote" {...props} />
    ),
    
    // Custom heading rendering with anchors
    h1: ({ node, ...props }) => <h1 className="markdown-h1" {...props} />,
    h2: ({ node, ...props }) => <h2 className="markdown-h2" {...props} />,
    h3: ({ node, ...props }) => <h3 className="markdown-h3" {...props} />,
    h4: ({ node, ...props }) => <h4 className="markdown-h4" {...props} />,
    h5: ({ node, ...props }) => <h5 className="markdown-h5" {...props} />,
    h6: ({ node, ...props }) => <h6 className="markdown-h6" {...props} />,
    
    // Custom list rendering
    ul: ({ node, ...props }) => <ul className="markdown-list" {...props} />,
    ol: ({ node, ...props }) => <ol className="markdown-list markdown-list-ordered" {...props} />,
    
    // Custom paragraph rendering
    p: ({ node, ...props }) => <p className="markdown-paragraph" {...props} />
  }
};

/**
 * Performance configuration
 */
export const performanceConfig = {
  // Maximum content length to render (characters)
  maxContentLength: 50000,
  
  // Enable memoization for large content
  enableMemo: true,
  
  // Debounce delay for live rendering (ms)
  renderDebounce: 100
};

/**
 * Validation configuration
 */
export const validationConfig = {
  // Enable XSS validation
  enableXSSCheck: true,
  
  // Enable content length validation
  enableLengthCheck: true,
  
  // Warn on suspicious patterns
  warnPatterns: [
    /javascript:/i,
    /on\w+=/i,          // Event handlers like onclick=
    /<script/i,
    /<iframe/i,
    /data:text\/html/i
  ]
};

/**
 * Validate markdown content for security issues
 * @param {string} content - Markdown content to validate
 * @returns {Object} Validation result { isValid: boolean, warnings: string[] }
 */
export function validateMarkdownContent(content) {
  const warnings = [];
  
  if (!validationConfig.enableXSSCheck) {
    return { isValid: true, warnings };
  }
  
  // Check length
  if (validationConfig.enableLengthCheck && content.length > performanceConfig.maxContentLength) {
    warnings.push(`Content exceeds maximum length (${performanceConfig.maxContentLength} chars)`);
  }
  
  // Check for suspicious patterns
  for (const pattern of validationConfig.warnPatterns) {
    if (pattern.test(content)) {
      warnings.push(`Suspicious pattern detected: ${pattern.source}`);
    }
  }
  
  return {
    isValid: warnings.length === 0,
    warnings
  };
}

/**
 * Sanitize markdown content before rendering
 * @param {string} content - Raw markdown content
 * @returns {string} Sanitized markdown content
 */
export function sanitizeMarkdown(content) {
  if (!content) return '';
  
  // Basic sanitization: remove null bytes and control characters
  let sanitized = content.replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Validate content
  const validation = validateMarkdownContent(sanitized);
  
  if (!validation.isValid && validation.warnings.length > 0) {
    console.warn('Markdown validation warnings:', validation.warnings);
  }
  
  return sanitized;
}

export default {
  sanitizeSchema,
  markdownOptions,
  performanceConfig,
  validationConfig,
  validateMarkdownContent,
  sanitizeMarkdown
};
