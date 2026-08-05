const OpenAI = require('openai');
const pdfParse = require('pdf-parse');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Extract text and estimate structure from PDF using pdf-parse
 * This is a simpler approach that doesn't require pdfjs-dist
 * @param {Buffer} pd