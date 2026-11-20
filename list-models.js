require('dotenv').config({ path: '.env.local' });
const { GoogleGenerativeAI } = require('@google/generative-ai');

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is required');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// List available models
async function listModels() {
  try {
    const models = await genAI.listModels();
    console.log('Available models:');
    for (const model of models.models) {
      console.log(`  - ${model.name}: ${model.supportedGenerationMethods?.join(', ')}`);
    }
  } catch (e) {
    console.error('Error listing models:', e.message);
  }
}

listModels();