const axios = require('axios');

async function testRegionEndpoint() {
  try {
    const response = await axios.post('http://localhost:3000/admin/ingestion/region', {
      region: {
        name: 'SoHo, New York'
      },
      vibeKey: 'RELAXED',
      searchRadiusM: 800
    }, {
      headers: {
        'Authorization': 'Bearer test-token',
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Region event created:', response.data.id);
    console.log('📍 Region:', response.data.regionName);
    console.log('🎭 Vibe:', response.data.vibeKey);
    console.log('📷 Gallery:', response.data.gallery?.length || 0, 'photos');
    console.log('📋 Plans:', response.data.plans?.length || 0);
    
    if (response.data.plans?.length > 0) {
      response.data.plans.forEach((plan, i) => {
        console.log(`  Plan ${i+1}: ${plan.venue} (${plan.rating}⭐)`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

console.log('🧪 Testing Region Engine...');
testRegionEndpoint();