const { mysqlPool } = require('../../config/database');

const tools = [
  {
    name: 'search_artifacts',
    schema: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'The keyword to search for in artifacts (name, description, category, era).'
        },
        limit: {
          type: 'integer',
          description: 'The maximum number of results to return (default: 5).'
        }
      },
      required: ['keyword']
    },
    handler: async ({ keyword, limit = 5 }) => {
      if (!keyword) return JSON.stringify([]);
      
      try {
        const query = `
          SELECT id, name, category, era, description, location 
          FROM artifacts 
          WHERE name LIKE ? OR description LIKE ? OR category LIKE ? OR era LIKE ?
          LIMIT ?
        `;
        const searchPattern = `%${keyword}%`;
        const [rows] = await mysqlPool.execute(query, [searchPattern, searchPattern, searchPattern, searchPattern, limit]);
        
        return JSON.stringify(rows);
      } catch (error) {
        console.error('[Tool:search_artifacts] Error:', error);
        return JSON.stringify({ error: error.message });
      }
    }
  },
  {
    name: 'get_artifact_details',
    schema: {
      type: 'object',
      properties: {
        id: {
          type: 'integer',
          description: 'The ID of the artifact to retrieve details for.'
        }
      },
      required: ['id']
    },
    handler: async ({ id }) => {
      if (!id) return JSON.stringify({ error: 'ID is required' });
      
      try {
        const [rows] = await mysqlPool.execute(
          'SELECT * FROM artifacts WHERE id = ?',
          [id]
        );
        
        if (rows.length === 0) {
          return JSON.stringify({ error: 'Artifact not found' });
        }
        
        return JSON.stringify(rows[0]);
      } catch (error) {
        console.error('[Tool:get_artifact_details] Error:', error);
        return JSON.stringify({ error: error.message });
      }
    }
  }
];

module.exports = tools;
