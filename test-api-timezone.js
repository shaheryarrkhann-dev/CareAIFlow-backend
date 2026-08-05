/**
 * Test script to verify audit trail timezone implementation
 * Run with: node test-api-timezone.js YOUR_ADMIN_TOKEN
 */

const http = require('http');

// Get token from command line argument
const token = process.argv[2];

if (!token) {
  console.error('❌ Error: Please provide an admin token');
  console.log('\nUsage: node test-api-timezone.js YOUR_ADMIN_TOKEN');
  console.log('\nExample: node test-api-timezone.js eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
  process.exit(1);
}

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/audit/logs?limit=5',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
};

console.log('🧪 Testing Audit Trail Timezone Implementation...\n');
console.log('📍 Endpoint: http://localhost:4000/api/audit/logs?limit=5\n');

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      
      console.log('📊 Response Status:', res.statusCode);
      console.log('─'.repeat(80));
      
      if (res.statusCode === 200 && response.success) {
        console.log('✅ API Request Successful\n');
        
        if (response.data && response.data.length > 0) {
          console.log('🕐 Checking Timestamps:\n');
          
          let allCorrect = true;
          
          response.data.forEach((log, index) => {
            const timestamp = log.createdAt;
            const hasCorrectFormat = timestamp && timestamp.includes('+05:00');
            
            console.log(`Log ${index + 1}:`);
            console.log(`  ID: ${log.id}`);
            console.log(`  Action: ${log.action}`);
            console.log(`  Created At: ${timestamp}`);
            console.log(`  Format Check: ${hasCorrectFormat ? '✅ Correct (+05:00)' : '❌ Wrong (missing +05:00)'}`);
            console.log('');
            
            if (!hasCorrectFormat) {
              allCorrect = false;
            }
          });
          
          console.log('─'.repeat(80));
          if (allCorrect) {
            console.log('✅ SUCCESS: All timestamps are in UTC+05:00 format!');
            console.log('\n💡 The timezone implementation is working correctly.');
          } else {
            console.log('❌ ISSUE: Some timestamps are not in UTC+05:00 format.');
            console.log('\n🔧 Troubleshooting:');
            console.log('   1. Restart the server: npm run dev');
            console.log('   2. Ensure code files are saved');
            console.log('   3. Clear Node.js cache: rm -rf node_modules/.cache');
          }
          
        } else {
          console.log('⚠️  No audit logs found in the response.');
          console.log('\n💡 Try logging in to create some audit logs first.');
        }
        
      } else {
        console.log('❌ API Request Failed\n');
        console.log('Response:', JSON.stringify(response, null, 2));
        
        if (res.statusCode === 401 || res.statusCode === 403) {
          console.log('\n🔐 Authentication Issue:');
          console.log('   - Token might be expired or invalid');
          console.log('   - Ensure you have ADMIN or SUPER_ADMIN role');
        }
      }
      
      console.log('\n' + '─'.repeat(80));
      
    } catch (error) {
      console.error('❌ Error parsing response:', error.message);
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request Error:', error.message);
  console.log('\n🔧 Troubleshooting:');
  console.log('   - Is the server running on http://localhost:4000?');
  console.log('   - Run: npm run dev');
});

req.end();

