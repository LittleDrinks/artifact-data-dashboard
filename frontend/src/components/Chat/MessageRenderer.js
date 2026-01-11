import React, { memo, useMemo } from 'react';
import PropTypes from 'prop-types';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeMathjax from 'rehype-mathjax';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import {
  sanitizeSchema,
  markdownOptions,
  sanitizeMarkdown,
  performanceConfig
} from '../../utils/markdown-config';
import { handleMarkdownRenderError } from '../../utils/error-handler';
import '../../styles/markdown-highlight.css';

/**
 * MessageRenderer Component
 * Feature: 002-enhance-smart-qa / US1 - Markdown格式显示
 * Purpose: Safely render AI responses with full markdown support
 * 
 * Supports:
 * - Code blocks with syntax highlighting
 * - Tables, lists, links
 * - Mathematical expressions (LaTeX)
 * - Blockquotes, headers
 * - XSS protection via rehype-sanitize
 */
const MessageRenderer = memo(({ content, className = '', onError = null }) => {
  // Sanitize content before rendering
  const sanitizedContent = useMemo(() => {
    if (!content || typeof content !== 'string') {
      return '';
    }
    
    return sanitizeMarkdown(content);
  }, [content]);

  // Check if content exceeds max length
  const shouldRender = useMemo(() => {
    return sanitizedContent.length <= performanceConfig.maxContentLength;
  }, [sanitizedContent]);

  // Configure remark/rehype plugins
  const remarkPlugins = useMemo(() => [remarkMath], []);
  
  const rehypePlugins = useMemo(() => [
    rehypeHighlight,
    [rehypeSanitize, sanitizeSchema],
    rehypeMathjax
  ], []);

  // Render fallback for oversized content
  if (!shouldRender) {
    return (
      <div className={`message-renderer message-renderer-error ${className}`}>
        <div className="error-banner">
          <span className="error-icon">⚠️</span>
          <span>Content too large to render safely ({sanitizedContent.length} chars)</span>
        </div>
        <pre className="message-raw-content">
          {sanitizedContent.substring(0, 1000)}...
        </pre>
      </div>
    );
  }

  // Error boundary wrapper
  try {
    return (
      <div className={`message-renderer ${className}`}>
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          components={markdownOptions.components}
        >
          {sanitizedContent}
        </ReactMarkdown>
      </div>
    );
  } catch (error) {
    console.error('Markdown rendering error:', error);
    
    // Call error handler if provided
    if (onError) {
      onError(error, content);
    }
    
    // Fallback to plain text rendering
    return handleMarkdownRenderError(error, content, className);
  }
});

MessageRenderer.propTypes = {
  /**
   * Markdown content to render
   */
  content: PropTypes.string.isRequired,
  
  /**
   * Additional CSS classes
   */
  className: PropTypes.string,
  
  /**
   * Error callback handler
   */
  onError: PropTypes.func
};

MessageRenderer.displayName = 'MessageRenderer';

export default MessageRenderer;
