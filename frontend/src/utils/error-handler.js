/**
 * Error Handler Utilities
 * Feature: 002-enhance-smart-qa / Phase 7 - Polish
 * Purpose: Centralized error handling with fallback rendering
 */

import React from 'react';
import { toast } from 'react-toastify';

/**
 * Handle markdown rendering errors with fallback display
 * 
 * @param {Error} error - The error object
 * @param {string} content - Original content that failed to render
 * @param {string} className - CSS class name
 * @returns {JSX.Element} Fallback error display component
 */
export const handleMarkdownRenderError = (error, content, className = '') => {
  console.error('[Markdown Renderer] Rendering failed:', error);
  
  // Log error details for debugging
  const errorDetails = {
    message: error.message,
    stack: error.stack,
    contentLength: content ? content.length : 0,
    timestamp: new Date().toISOString()
  };
  
  console.error('[Markdown Renderer] Error details:', errorDetails);
  
  // Return fallback plain text display
  return (
    <div className={`message-renderer message-renderer-fallback ${className}`}>
      <div className="error-banner">
        <span className="error-icon">⚠️</span>
        <span>Markdown rendering failed. Displaying as plain text.</span>
      </div>
      <pre className="message-raw-content" style={{
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        margin: '8px 0',
        padding: '8px',
        backgroundColor: '#f5f5f5',
        border: '1px solid #e0e0e0',
        borderRadius: '4px'
      }}>
        {content}
      </pre>
    </div>
  );
};

/**
 * Show error toast notification
 * 
 * @param {string} message - Error message
 * @param {Object} options - Toast options
 */
export const showErrorToast = (message, options = {}) => {
  toast.error(message, {
    position: "top-right",
    autoClose: 5000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    ...options
  });
};

/**
 * Show success toast notification
 * 
 * @param {string} message - Success message
 * @param {Object} options - Toast options
 */
export const showSuccessToast = (message, options = {}) => {
  toast.success(message, {
    position: "top-right",
    autoClose: 3000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    ...options
  });
};

/**
 * Show info toast notification
 * 
 * @param {string} message - Info message
 * @param {Object} options - Toast options
 */
export const showInfoToast = (message, options = {}) => {
  toast.info(message, {
    position: "top-right",
    autoClose: 4000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    ...options
  });
};

/**
 * Show warning toast notification
 * 
 * @param {string} message - Warning message
 * @param {Object} options - Toast options
 */
export const showWarningToast = (message, options = {}) => {
  toast.warning(message, {
    position: "top-right",
    autoClose: 5000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    ...options
  });
};

/**
 * Handle API errors and show appropriate toast
 * 
 * @param {Error|Object} error - Error object from API call
 * @param {string} fallbackMessage - Fallback message if error details unavailable
 */
export const handleApiError = (error, fallbackMessage = 'An error occurred') => {
  let errorMessage = fallbackMessage;
  
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    errorMessage = error.response.data?.message || 
                   error.response.data?.error || 
                   `Error: ${error.response.status}`;
  } else if (error.request) {
    // The request was made but no response was received
    errorMessage = 'No response from server. Please check your connection.';
  } else if (error.message) {
    // Something happened in setting up the request that triggered an Error
    errorMessage = error.message;
  }
  
  showErrorToast(errorMessage);
  
  // Log for debugging
  console.error('[API Error]', {
    message: errorMessage,
    originalError: error,
    timestamp: new Date().toISOString()
  });
  
  return errorMessage;
};

/**
 * Log error to console with structured format
 * 
 * @param {string} context - Where the error occurred
 * @param {Error} error - Error object
 * @param {Object} metadata - Additional metadata
 */
export const logError = (context, error, metadata = {}) => {
  const errorLog = {
    context,
    message: error.message,
    stack: error.stack,
    metadata,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent
  };
  
  console.error(`[Error] ${context}:`, errorLog);
  
  // In production, you could send this to a logging service
  // e.g., Sentry, LogRocket, etc.
};

/**
 * Validate response from API
 * 
 * @param {Object} response - API response
 * @returns {boolean} True if valid
 */
export const validateApiResponse = (response) => {
  if (!response) {
    showErrorToast('Invalid response from server');
    return false;
  }
  
  if (response.error) {
    showErrorToast(response.error);
    return false;
  }
  
  return true;
};

/**
 * Wrap async function with error handling
 * 
 * @param {Function} fn - Async function to wrap
 * @param {string} errorContext - Context for error logging
 * @returns {Function} Wrapped function
 */
export const withErrorHandling = (fn, errorContext) => {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(errorContext, error, { args });
      handleApiError(error);
      throw error; // Re-throw for caller to handle if needed
    }
  };
};

export default {
  handleMarkdownRenderError,
  showErrorToast,
  showSuccessToast,
  showInfoToast,
  showWarningToast,
  handleApiError,
  logError,
  validateApiResponse,
  withErrorHandling
};
