#!/usr/bin/env node

/**
 * Test script for MCP OAuth2 configuration
 * Run with: node test-oauth2.js
 */

require('dotenv').config({ path: '.env.local' });

async function testOAuth2Config() {
  console.log('🔐 Testing MCP OAuth2 Configuration...\n');

  // Check required environment variables
  const requiredVars = [
    'MCP_OAUTH2_CLIENT_ID',
    'MCP_OAUTH2_CLIENT_SECRET', 
    'MCP_OAUTH2_TOKEN_ENDPOINT'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nPlease add these to your .env.local file.');
    process.exit(1);
  }

  console.log('✅ Environment variables configured:');
  console.log(`   - CLIENT_ID: ${process.env.MCP_OAUTH2_CLIENT_ID}`);
  console.log(`   - TOKEN_ENDPOINT: ${process.env.MCP_OAUTH2_TOKEN_ENDPOINT}`);
  console.log(`   - AUDIENCE: ${process.env.MCP_OAUTH2_AUDIENCE || 'not set'}`);
  console.log();

  // Test OAuth2 token request
  try {
    console.log('🔄 Testing OAuth2 token request...');

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.MCP_OAUTH2_CLIENT_ID,
      client_secret: process.env.MCP_OAUTH2_CLIENT_SECRET,
    });

    if (process.env.MCP_OAUTH2_AUDIENCE) {
      params.append('audience', process.env.MCP_OAUTH2_AUDIENCE);
    }

    const response = await fetch(process.env.MCP_OAUTH2_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorText}`);
    }

    const tokenData = await response.json();

    if (!tokenData.access_token) {
      throw new Error('Response missing access_token field');
    }

    console.log('✅ OAuth2 token request successful!');
    console.log(`   - Token type: ${tokenData.token_type || 'Bearer'}`);
    console.log(`   - Expires in: ${tokenData.expires_in} seconds`);
    console.log(`   - Scopes: ${tokenData.scope || 'default'}`);
    console.log(`   - Token preview: ${tokenData.access_token.substring(0, 20)}...`);

    // Test LangGraph server connectivity (if reachable)
    if (process.env.LANGGRAPH_SERVER_URL) {
      console.log('\n🔄 Testing LangGraph server connectivity...');
      
      try {
        const lgResponse = await fetch(`${process.env.LANGGRAPH_SERVER_URL}/threads`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ metadata: { test: true } })
        });

        if (lgResponse.ok) {
          console.log('✅ LangGraph server is accessible with OAuth2 token!');
        } else {
          console.log(`⚠️  LangGraph server responded with: ${lgResponse.status} ${lgResponse.statusText}`);
          console.log('   This may be expected if the server is not running or requires different authentication.');
        }
      } catch (lgError) {
        console.log(`⚠️  Could not connect to LangGraph server: ${lgError.message}`);
        console.log('   This is normal if the LangGraph server is not running.');
      }
    }

  } catch (error) {
    console.error('❌ OAuth2 token request failed:', error.message);
    console.error('\nTroubleshooting tips:');
    console.error('1. Verify your client ID and secret are correct');
    console.error('2. Check that the token endpoint URL is accessible');
    console.error('3. Ensure the OAuth2 server supports client_credentials flow');
    console.error('4. Check if audience parameter is required/correct');
    process.exit(1);
  }

  console.log('\n🎉 OAuth2 configuration test completed successfully!');
}

testOAuth2Config().catch(console.error);