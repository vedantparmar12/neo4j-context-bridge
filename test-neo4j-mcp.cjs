#!/usr/bin/env node

console.log('Neo4j Context MCP Server Test');
console.log('=============================\n');

// Check if all required files exist
const fs = require('fs');
const path = require('path');

const requiredFiles = [
  'src/index-neo4j.ts',
  'src/types/neo4j-types.ts',
  'src/neo4j/connection.ts',
  'src/neo4j/security.ts',
  'src/extractors/context-extractor.ts',
  'src/embeddings/cloudflare-ai.ts',
  'src/search/semantic-search.ts',
  'src/tools/extraction-tools.ts',
  'src/tools/search-tools.ts',
  'src/tools/management-tools.ts',
  'src/tools/injection-tools.ts',
  'wrangler-neo4j.jsonc',
  '.dev.vars'
];

console.log('Checking required files:');
let allFilesExist = true;

requiredFiles.forEach(file => {
  const exists = fs.existsSync(path.join(__dirname, file));
  console.log(`  ${exists ? '✓' : '✗'} ${file}`);
  if (!exists) allFilesExist = false;
});

console.log('\nChecking environment variables in .dev.vars:');
if (fs.existsSync('.dev.vars')) {
  const devVars = fs.readFileSync('.dev.vars', 'utf8');
  const requiredVars = [
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'COOKIE_ENCRYPTION_KEY',
    'NEO4J_URI',
    'NEO4J_USER',
    'NEO4J_PASSWORD'
  ];
  
  requiredVars.forEach(varName => {
    const exists = devVars.includes(varName);
    console.log(`  ${exists ? '✓' : '✗'} ${varName}`);
  });
}

console.log('\nChecking package.json dependencies:');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const requiredDeps = ['neo4j-driver', 'marked', 'tiktoken'];

requiredDeps.forEach(dep => {
  const exists = packageJson.dependencies[dep];
  console.log(`  ${exists ? '✓' : '✗'} ${dep}: ${exists || 'not found'}`);
});

console.log('\n=============================');
console.log(allFilesExist ? '✓ All files created successfully!' : '✗ Some files are missing');
console.log('\nTo run the server:');
console.log('  1. Update .dev.vars with real Neo4j credentials');
console.log('  2. Run: npm run dev:neo4j');
console.log('  3. Configure Claude Desktop with claude_desktop_config.json');
console.log('\nSee README-NEO4J.md for detailed instructions.');