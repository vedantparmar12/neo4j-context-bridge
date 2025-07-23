#!/usr/bin/env node

console.log('Testing Neo4j MCP Server Endpoint...\n');

// Test if the MCP endpoint is accessible
fetch('http://localhost:8793/mcp', {
  method: 'GET',
  headers: {
    'Accept': 'text/event-stream'
  }
})
.then(response => {
  console.log('MCP Endpoint Status:', response.status);
  console.log('Headers:', Object.fromEntries(response.headers.entries()));
  
  if (response.status === 302) {
    console.log('\n✓ MCP server is running!');
    console.log('  The 302 redirect indicates OAuth is required (expected behavior)');
    console.log('\nTo use the MCP server:');
    console.log('  1. Configure Claude Desktop with claude_desktop_config.json');
    console.log('  2. Claude will handle the OAuth flow automatically');
  } else if (response.ok) {
    console.log('\n✓ MCP endpoint is accessible');
  } else {
    console.log('\n✗ Unexpected response from MCP endpoint');
  }
})
.catch(error => {
  console.error('✗ Error connecting to MCP server:', error.message);
  console.log('\nMake sure the server is running with: npm run dev:neo4j');
});

// Also test the authorize endpoint
setTimeout(() => {
  fetch('http://localhost:8793/authorize')
    .then(response => {
      console.log('\nAuthorize Endpoint Status:', response.status);
      if (response.status === 400) {
        console.log('✓ OAuth authorize endpoint is ready (400 = missing parameters, expected)');
      }
    })
    .catch(error => {
      console.error('✗ Error checking authorize endpoint:', error.message);
    });
}, 1000);