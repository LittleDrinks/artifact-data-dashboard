module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npx vite preview --port 4173',
      url: ['http://localhost:4173/login'],
      numberOfRuns: 3,
    },
    upload: {
      target: 'temporary-public-storage',
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.3 }],
        'categories:accessibility': ['warn', { minScore: 0.7 }],
        'categories:best-practices': ['warn', { minScore: 0.7 }],
        'categories:seo': ['warn', { minScore: 0.7 }],
      },
    },
  },
};
