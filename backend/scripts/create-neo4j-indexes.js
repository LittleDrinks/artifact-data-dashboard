#!/usr/bin/env node

/**
 * Create Neo4j Indexes for Performance Optimization
 * Feature: 002-enhance-smart-qa
 * Purpose: Create indexes on Artifact and Attachment nodes for faster Cypher queries
 */

const neo4j = require('neo4j-driver');

// Load environment variables
require('dotenv').config();

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

const driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
  { disableLosslessIntegers: true }
);

async function createIndexes() {
  const session = driver.session();
  
  try {
    console.log('Creating Neo4j indexes...');
    
    // Artifact node indexes
    await session.run(
      'CREATE INDEX artifact_id_idx IF NOT EXISTS FOR (a:Artifact) ON (a.id)'
    );
    console.log('✓ Created index on Artifact.id');
    
    await session.run(
      'CREATE INDEX artifact_name_idx IF NOT EXISTS FOR (a:Artifact) ON (a.name)'
    );
    console.log('✓ Created index on Artifact.name');
    
    await session.run(
      'CREATE INDEX artifact_category_idx IF NOT EXISTS FOR (a:Artifact) ON (a.category)'
    );
    console.log('✓ Created index on Artifact.category');
    
    await session.run(
      'CREATE INDEX artifact_era_idx IF NOT EXISTS FOR (a:Artifact) ON (a.era)'
    );
    console.log('✓ Created index on Artifact.era');
    
    // Attachment node indexes
    await session.run(
      'CREATE INDEX attachment_id_idx IF NOT EXISTS FOR (att:Attachment) ON (att.id)'
    );
    console.log('✓ Created index on Attachment.id');
    
    await session.run(
      'CREATE INDEX attachment_type_idx IF NOT EXISTS FOR (att:Attachment) ON (att.type)'
    );
    console.log('✓ Created index on Attachment.type');
    
    // Composite index for common query patterns
    await session.run(
      'CREATE INDEX artifact_category_era_idx IF NOT EXISTS FOR (a:Artifact) ON (a.category, a.era)'
    );
    console.log('✓ Created composite index on Artifact(category, era)');
    
    // Full-text index for text search (Neo4j 4.x+)
    try {
      await session.run(`
        CREATE FULLTEXT INDEX artifact_search_idx IF NOT EXISTS
        FOR (a:Artifact) 
        ON EACH [a.name, a.description, a.location]
      `);
      console.log('✓ Created full-text index on Artifact text fields');
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.warn('⚠ Full-text index creation skipped (may require Neo4j 4.x+)');
      }
    }
    
    // Verify indexes
    console.log('\nVerifying indexes...');
    const result = await session.run('SHOW INDEXES');
    
    console.log('\nActive indexes:');
    result.records.forEach(record => {
      const name = record.get('name');
      const labelsOrTypes = record.get('labelsOrTypes');
      const properties = record.get('properties');
      const state = record.get('state');
      console.log(`  - ${name} on ${labelsOrTypes}(${properties}) [${state}]`);
    });
    
    console.log('\n✅ Neo4j index creation completed successfully!');
    
  } catch (error) {
    console.error('❌ Error creating Neo4j indexes:', error.message);
    throw error;
  } finally {
    await session.close();
  }
}

async function main() {
  try {
    await createIndexes();
  } catch (error) {
    console.error('Failed to create indexes:', error);
    process.exit(1);
  } finally {
    await driver.close();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { createIndexes };
