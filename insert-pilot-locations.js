const { Client } = require('pg');

const client = new Client({ 
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' 
});

const locations = [
  {
    name: 'Hampi Heritage Site',
    slug: 'hampi-heritage-site',
    description: 'UNESCO World Heritage site with ancient temples and ruins',
    category_id: '07fb4663-8ee7-4d6b-93a8-db498f619052', // temple
    pricing_type: 'paid',
    price: 600,
    price_note: 'Entry fee for Indians',
    country_id: 'a908dfa0-efa9-47f9-8129-1a0b54e8b4f8',
    state_id: '436d121f-9739-453c-a791-d54280df929f', // karnataka
    city_id: '1f43b173-3929-472c-9dd3-16d4c7a5ade0', // hampi
    is_published: true,
    latitude: 15.3350,
    longitude: 76.4600,
    map_url: 'https://goo.gl/maps/hampi'
  },
  {
    name: 'Coorg Coffee Plantation',
    slug: 'coorg-coffee-plantation',
    description: 'Scenic coffee plantation in the Western Ghats',
    category_id: 'cb3eaeb3-aa64-40e1-a3d3-01a7007f13f7', // hill
    pricing_type: 'paid',
    price: 500,
    price_note: 'Entry fee for photography',
    country_id: 'a908dfa0-efa9-47f9-8129-1a0b54e8b4f8',
    state_id: '436d121f-9739-453c-a791-d54280df929f', // karnataka
    city_id: '8d98b832-2e02-43e4-a3b6-37fcb545a21c', // coorg
    is_published: true,
    latitude: 12.3375,
    longitude: 75.8069,
    map_url: 'https://goo.gl/maps/coorg'
  },
  {
    name: 'Fort Kochi',
    slug: 'fort-kochi',
    description: 'Historic waterfront area with colonial architecture',
    category_id: 'cab04195-1322-4cdb-9c97-e95bfac4bd29', // beach
    pricing_type: 'free',
    price: null,
    price_note: null,
    country_id: 'a908dfa0-efa9-47f9-8129-1a0b54e8b4f8',
    state_id: '438d78b6-4f5a-4165-b56a-cdde02e4477f', // kerala
    city_id: '0951d926-d08b-4b42-96aa-7fa2225296af', // kochi
    is_published: true,
    latitude: 9.9667,
    longitude: 76.2417,
    map_url: 'https://goo.gl/maps/fortkochi'
  },
  {
    name: 'Munnar Tea Gardens',
    slug: 'munnar-tea-gardens',
    description: 'Rolling tea plantations in the Western Ghats',
    category_id: 'cb3eaeb3-aa64-40e1-a3d3-01a7007f13f7', // hill
    pricing_type: 'paid',
    price: 300,
    price_note: 'Entry fee for photography',
    country_id: 'a908dfa0-efa9-47f9-8129-1a0b54e8b4f8',
    state_id: '438d78b6-4f5a-4165-b56a-cdde02e4477f', // kerala
    city_id: '5e8882f6-97fc-4a6e-93a1-7af43660baa0', // munnar
    is_published: true,
    latitude: 10.0889,
    longitude: 77.0595,
    map_url: 'https://goo.gl/maps/munnar'
  },
  {
    name: 'Bangalore Palace Grounds',
    slug: 'bangalore-palace-grounds',
    description: 'Royal palace with sprawling grounds in the city center',
    category_id: '07fb4663-8ee7-4d6b-93a8-db498f619052', // temple
    pricing_type: 'paid',
    price: 400,
    price_note: 'Entry fee for Indians',
    country_id: 'a908dfa0-efa9-47f9-8129-1a0b54e8b4f8',
    state_id: '436d121f-9739-453c-a791-d54280df929f', // karnataka
    city_id: '3326d7db-fc09-4f4b-8774-f3df530e1109', // bengaluru
    is_published: true,
    latitude: 12.9987,
    longitude: 77.5920,
    map_url: 'https://goo.gl/maps/bangalorepalace'
  }
];

async function insertLocations() {
  try {
    await client.connect();
    console.log('Connected to database');
    
    await client.query('ALTER TABLE locations DISABLE ROW LEVEL SECURITY');
    console.log('RLS disabled');
    
    for (const loc of locations) {
      const result = await client.query(`
        INSERT INTO locations (name, slug, description, category_id, pricing_type, price, price_note, country_id, state_id, city_id, is_published, latitude, longitude, map_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (slug) DO NOTHING
        RETURNING id, name, slug
      `, [loc.name, loc.slug, loc.description, loc.category_id, loc.pricing_type, loc.price, loc.price_note, loc.country_id, loc.state_id, loc.city_id, loc.is_published, loc.latitude, loc.longitude, loc.map_url]);
      
      if (result.rows.length > 0) {
        console.log('Inserted:', result.rows[0].name);
      } else {
        console.log('Already exists:', loc.name);
      }
    }
    
    const all = await client.query("SELECT id, name, slug, is_published FROM locations WHERE is_published = true ORDER BY name");
    console.log('\nAll published locations:');
    console.table(all.rows);
    
    await client.query('ALTER TABLE locations ENABLE ROW LEVEL SECURITY');
    console.log('RLS re-enabled');
    
    await client.end();
  } catch (e) {
    console.error('Error:', e.message, e.detail, e.hint);
    await client.end();
  }
}

insertLocations();