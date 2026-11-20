import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local
const envPath = join(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length > 0) {
      process.env[key.trim()] = rest.join('=').trim();
    }
  }
}

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3.8-flash';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

if (!API_KEY) {
  console.error('GEMINI_API_KEY not found in environment');
  process.exit(1);
}

console.log('=== PhotoBlinks Gemini Pilot (Stage H2) ===');
console.log(`Model: ${MODEL}`);
console.log(`API Key: ${API_KEY.slice(0, 8)}...${API_KEY.slice(-4)}`);
console.log('');

// Schema for structured output
const LOCATION_SCHEMA = {
  type: 'object',
  properties: {
    locationName: { type: 'string' },
    state: { type: 'string' },
    category: { type: 'string' },
    pricingTiers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tierName: { type: 'string' },
          priceINR: { type: 'number' },
          duration: { type: 'string' },
          includes: { type: 'array', items: { type: 'string' } }
        },
        required: ['tierName', 'priceINR', 'duration']
      }
    },
    permitRequired: { type: 'boolean' },
    permitAuthority: { type: 'string' },
    permitCostINR: { type: 'number' },
    bestMonths: { type: 'array', items: { type: 'string' } },
    contactInfo: {
      type: 'object',
      properties: {
        phone: { type: 'string' },
        email: { type: 'string' },
        website: { type: 'string' }
      }
    },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          uri: { type: 'string' }
        }
      }
    },
    notes: { type: 'string' }
  },
  required: ['locationName', 'state', 'category', 'pricingTiers', 'permitRequired', 'bestMonths', 'sources']
};

const LOCATIONS = [
  { name: 'Hampi Heritage Site', state: 'Karnataka', category: 'Heritage/Monument' },
  { name: 'Coorg Coffee Plantation', state: 'Karnataka', category: 'Nature/Plantation' },
  { name: 'Fort Kochi', state: 'Kerala', category: 'Heritage/Urban' },
  { name: 'Munnar Tea Gardens', state: 'Kerala', category: 'Nature/Plantation' },
  { name: 'Bangalore Palace Grounds', state: 'Karnataka', category: 'Urban/Studio-adjacent' }
];

async function callGenerateContent(prompt, tools = null, responseSchema = null) {
  const url = `${BASE_URL}/models/${MODEL}:generateContent?key=${API_KEY}`;
  
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
    }
  };
  
  if (tools) {
    body.tools = tools;
  }
  
  if (responseSchema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = responseSchema;
  }
  
  const startTime = Date.now();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const latency = Date.now() - startTime;
  
  const data = await response.json();
  
  if (!response.ok) {
    return { error: data.error || `HTTP ${response.ok}`, latency, status: response.status };
  }
  
  return { data, latency };
}

function extractGroundingMetadata(candidate) {
  if (!candidate.groundingMetadata) return null;
  const gm = candidate.groundingMetadata;
  return {
    webSearchQueries: gm.webSearchQueries || [],
    groundingChunks: (gm.groundingChunks || []).map(c => ({
      title: c.web?.title,
      uri: c.web?.uri
    })).filter(c => c.title && c.uri),
    groundingSupports: gm.groundingSupports || [],
    searchEntryPoint: gm.searchEntryPoint
  };
}

async function runPilot() {
  const results = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalGroundingRequests = 0;
  let totalCostUSD = 0;
  
  for (const loc of LOCATIONS) {
    console.log(`\n--- Testing: ${loc.name} (${loc.state}) ---`);
    
    // PASS 1: Grounding with Google Search
    console.log('Pass 1: Google Search grounding...');
    const pass1Prompt = `Find current 2026 photoshoot pricing, permit requirements, best seasons, and contact information for "${loc.name}" in ${loc.state}, India. 
Focus on:
1. Photoshoot pricing tiers (pre-wedding, commercial, casual, etc.) with prices in INR (₹)
2. Permit requirements and which authority issues them (ASI, Forest Dept, Local Municipality, etc.)
3. Permit costs in INR
4. Best months for photography
5. Contact information (phone, email, website) for booking/permits

Return comprehensive, current information with specific numbers where available.`;
    
    const pass1Result = await callGenerateContent(pass1Prompt, [{ google_search: {} }], null);
    
    if (pass1Result.error) {
      console.error(`  Pass 1 ERROR:`, pass1Result.error);
      results.push({ location: loc.name, error: `Pass 1: ${pass1Result.error}`, pass: 1 });
      continue;
    }
    
    const candidate1 = pass1Result.data.candidates?.[0];
    const groundingMeta = extractGroundingMetadata(candidate1);
    const pass1Text = candidate1?.content?.parts?.[0]?.text || '';
    
    console.log(`  Pass 1 OK (${pass1Result.latency}ms)`);
    console.log(`  Search queries: ${groundingMeta?.webSearchQueries?.length || 0}`);
    console.log(`  Sources found: ${groundingMeta?.groundingChunks?.length || 0}`);
    
    if (pass1Result.data.usageMetadata) {
      totalInputTokens += pass1Result.data.usageMetadata.promptTokenCount || 0;
      totalOutputTokens += pass1Result.data.usageMetadata.candidatesTokenCount || 0;
      console.log(`  Tokens: in=${pass1Result.data.usageMetadata.promptTokenCount}, out=${pass1Result.data.usageMetadata.candidatesTokenCount}`);
    }
    if (groundingMeta?.webSearchQueries?.length > 0) {
      totalGroundingRequests += groundingMeta.webSearchQueries.length;
    }
    
    // PASS 2: Structured extraction
    console.log('Pass 2: Structured JSON extraction...');
    const pass2Prompt = `Extract structured data from the following text about "${loc.name}" in ${loc.state}. 
Return ONLY valid JSON matching the schema. All prices MUST be in INR (₹).
Include the source URLs from the grounding metadata.

Text to extract from:
---
${pass1Text}
---
Grounding sources:
${JSON.stringify(groundingMeta?.groundingChunks || [], null, 2)}`;
    
    const pass2Result = await callGenerateContent(pass2Prompt, null, LOCATION_SCHEMA);
    
    if (pass2Result.error) {
      console.error(`  Pass 2 ERROR:`, pass2Result.error);
      results.push({ location: loc.name, error: `Pass 2: ${pass2Result.error}`, pass: 2, pass1Text });
      continue;
    }
    
    const candidate2 = pass2Result.data.candidates?.[0];
    let structuredData = null;
    try {
      structuredData = JSON.parse(candidate2?.content?.parts?.[0]?.text || '{}');
    } catch (e) {
      console.error(`  Pass 2 JSON parse error:`, e.message);
      results.push({ location: loc.name, error: `Pass 2 JSON parse: ${e.message}`, pass: 2, pass1Text });
      continue;
    }
    
    console.log(`  Pass 2 OK (${pass2Result.latency}ms)`);
    if (pass2Result.data.usageMetadata) {
      totalInputTokens += pass2Result.data.usageMetadata.promptTokenCount || 0;
      totalOutputTokens += pass2Result.data.usageMetadata.candidatesTokenCount || 0;
      console.log(`  Tokens: in=${pass2Result.data.usageMetadata.promptTokenCount}, out=${pass2Result.data.usageMetadata.candidatesTokenCount}`);
    }
    
    // Validate INR pricing
    let inrValid = true;
    if (structuredData.pricingTiers) {
      for (const tier of structuredData.pricingTiers) {
        if (typeof tier.priceINR !== 'number' || tier.priceINR <= 0) {
          console.warn(`  WARNING: Invalid INR price for ${tier.tierName}: ${tier.priceINR}`);
          inrValid = false;
        }
      }
    }
    if (structuredData.permitCostINR !== undefined && (typeof structuredData.permitCostINR !== 'number' || structuredData.permitCostINR < 0)) {
      console.warn(`  WARNING: Invalid permit cost INR: ${structuredData.permitCostINR}`);
      inrValid = false;
    }
    
    results.push({
      location: loc.name,
      state: loc.state,
      category: loc.category,
      success: true,
      pass1Latency: pass1Result.latency,
      pass2Latency: pass2Result.latency,
      groundingQueries: groundingMeta?.webSearchQueries?.length || 0,
      sourcesCount: groundingMeta?.groundingChunks?.length || 0,
      inrValid,
      data: structuredData
    });
    
    console.log(`  ✓ Completed: ${loc.name}`);
  }
  
  // Cost calculation (Gemini 3.8 Flash promotional: $0.75/1M input, $3.75/1M output)
  const INPUT_COST_PER_M = 0.75;
  const OUTPUT_COST_PER_M = 3.75;
  const GROUNDING_COST_PER_1K = 14; // after 5K free/month
  
  const inputCost = (totalInputTokens / 1_000_000) * INPUT_COST_PER_M;
  const outputCost = (totalOutputTokens / 1_000_000) * OUTPUT_COST_PER_M;
  const groundingCost = totalGroundingRequests > 5000 ? ((totalGroundingRequests - 5000) / 1000) * GROUNDING_COST_PER_1K : 0;
  totalCostUSD = inputCost + outputCost + groundingCost;
  
  // Summary
  console.log('\n=== PILOT SUMMARY ===');
  console.log(`Locations tested: ${LOCATIONS.length}`);
  console.log(`Successful: ${results.filter(r => r.success).length}`);
  console.log(`Failed: ${results.filter(r => !r.success).length}`);
  console.log(`Total input tokens: ${totalInputTokens.toLocaleString()}`);
  console.log(`Total output tokens: ${totalOutputTokens.toLocaleString()}`);
  console.log(`Total grounding queries: ${totalGroundingRequests}`);
  console.log(`Estimated cost: $${totalCostUSD.toFixed(4)} USD`);
  console.log(`  Input: $${inputCost.toFixed(4)}`);
  console.log(`  Output: $${outputCost.toFixed(4)}`);
  console.log(`  Grounding: $${groundingCost.toFixed(4)} (${totalGroundingRequests <= 5000 ? 'within free tier' : 'exceeds free tier'})`);
  console.log(`INR pricing validated: ${results.filter(r => r.success && r.inrValid).length}/${results.filter(r => r.success).length} locations`);
  
  // Detailed results
  console.log('\n=== DETAILED RESULTS ===');
  for (const r of results) {
    if (r.success) {
      console.log(`\n${r.location} (${r.state})`);
      console.log(`  Category: ${r.category}`);
      console.log(`  Pass 1 latency: ${r.pass1Latency}ms, Pass 2 latency: ${r.pass2Latency}ms`);
      console.log(`  Grounding queries: ${r.groundingQueries}, Sources: ${r.sourcesCount}`);
      console.log(`  INR valid: ${r.inrValid ? 'YES' : 'NO'}`);
      console.log(`  Pricing tiers: ${r.data.pricingTiers?.length || 0}`);
      if (r.data.pricingTiers) {
        for (const t of r.data.pricingTiers) {
          console.log(`    - ${t.tierName}: ₹${t.priceINR.toLocaleString()}/${t.duration}`);
        }
      }
      console.log(`  Permit required: ${r.data.permitRequired ? 'YES' : 'NO'}`);
      if (r.data.permitRequired) {
        console.log(`  Permit authority: ${r.data.permitAuthority}`);
        console.log(`  Permit cost: ₹${r.data.permitCostINR?.toLocaleString() || 'N/A'}`);
      }
      console.log(`  Best months: ${r.data.bestMonths?.join(', ') || 'N/A'}`);
      console.log(`  Sources: ${r.data.sources?.length || 0}`);
    } else {
      console.log(`\n${r.location}: FAILED (Pass ${r.pass}) - ${r.error}`);
    }
  }
  
  // Save results
  const fs = await import('fs');
  const outputPath = join(__dirname, '..', 'gemini-pilot-results.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    model: MODEL,
    summary: {
      totalLocations: LOCATIONS.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      totalInputTokens,
      totalOutputTokens,
      totalGroundingRequests,
      estimatedCostUSD: totalCostUSD,
      inrValidCount: results.filter(r => r.success && r.inrValid).length
    },
    results
  }, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
}

runPilot().catch(console.error);