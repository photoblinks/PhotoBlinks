require('dotenv').config({ path: '.env.local' });
const { verifyLocation } = require('./gemini-client');

async function test() {
  const testLocation = {
    name: 'Hampi Heritage Site',
    city_name: 'Hampi',
    state_name: 'Karnataka',
    category: 'Heritage/Monument',
    pre_wedding_shoot: 'not set',
    pre_wedding_shoot_condition: 'not set',
    prior_booking: 'not set',
    drone_status: 'not set',
    drone_permission: 'not set',
    entry_fee: 'not set',
    shoot_permit_fee: 'not set'
  };
  
  console.log('Testing single location verification...');
  const result = await verifyLocation(testLocation);
  
  console.log('\n=== RESULT ===');
  console.log('pre_wedding_shoot:', result.pre_wedding_shoot);
  console.log('drone_status:', result.drone_status);
  console.log('prior_booking:', result.prior_booking);
  console.log('entry_fee:', result.entry_fee);
  console.log('shoot_permit_fee:', result.shoot_permit_fee);
  console.log('confidence:', result.confidence);
  console.log('groundingQueries:', result.groundingQueries);
  console.log('groundedFieldCount:', result.groundedFieldCount);
  console.log('hasVerifiedSources:', result.hasVerifiedSources);
  console.log('fieldVerified:', result.fieldVerified);
  console.log('officialSourceCount:', result.officialSourceCount);
  console.log('summary:', result.summary);
  console.log('cost:', result.estimatedCostInr);
}

test().catch(console.error);