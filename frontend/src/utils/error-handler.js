import React from 'react';

/**
 * Error Handler for Markdown Rendering
 * Feature: 002-enhance-smart-qa / US1 - Markdown格式显示
 * Purpose: Graceful fallback when markdown rendering fails
 */

/**
 * Handle markdown rendering errors with fallback to plain text
 * @param {Error} error - The error that occurred
 * @param {string} content - Original content that failed to render
 * @param {string} className - CSS class name
 * @returns {JSX.Element} Fallback UI component
 */
export function handleMarkdownRenderError(error, content, className = '') {
  console.error('[MessageRenderer] Rendering failed, falling back to plain text:', {
    error: error.message,
    contentLength: content?.length || 0
  });

  return (
    <div className={`message-renderer message-renderer-fallback ${className}`}>
      <div className="render-error-banner">
        <span className="error-icon">⚠️</span>
        <span className="error-text">
          Markdown rendering failed. Displaying as plain text.
        </span>
      </div>
      <pre className="message-plain-text">{content}</pre>
    </div>
  );
}

/**
 * Error boundary component for MessageRenderer
 */
export class MessageRendererErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('MessageRenderer Error Boundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return handleMarkdownRenderError(
        this.state.error,
        this.props.content,
        this.props.className
      );
    }

    return this.props.children;
  }
}

/**
 * Log rendering performance metrics
 * @param {string} content - Content being rendered
 * @param {number} startTime - Rendering start timestamp
 */
export function logRenderingPerformance(content, startTime) {
  const duration = performance.now() - startTime;
  const contentLength = content?.length || 0;
  
  if (duration > 1000) {
    console.warn(`[MessageRenderer] Slow rendering detected: ${duration.toFixed(2)}ms for ${contentLength} chars`);
  } else if (process.env.NODE_ENV === 'development') {
    console.debug(`[MessageRenderer] Rendered in ${duration.toFixed(2)}ms (${contentLength} chars)`);
  }
}

/**
 * Validate content before rendering
 * @param {string} content - Content to validate
 * @returns {Object} Validation result { valid: boolean, reason: string }
 */
export function validateContentBeforeRender(content) {
  if (!content) {
    return { valid: false, reason: 'Content is empty' };
  }

  if (typeof content !== 'string') {
    return { valid: false, reason: 'Content must be a string' };
  }

  if (content.length > 100000) {
    return { valid: false, reason: 'Content exceeds maximum safe length' };
  }

  return { valid: true, reason: null };
}

/**
 * Truncate content for error display
 * @param {string} content - Content to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated content
 */
export function truncateContentForDisplay(content, maxLength = 500) {
  if (!content || content.length <= maxLength) {
    return content;
  }

  return `${content.substring(0, maxLength)}... (truncated, ${content.length} total chars)`;
}

export default {
  handleMarkdownRenderError,
  MessageRendererErrorBoundary,
  logRenderingPerformance,
  validateContentBeforeRender,
  truncateContentForDisplay
};
