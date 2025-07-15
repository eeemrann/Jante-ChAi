import dotenv from 'dotenv'
dotenv.config()

import { GoogleGenerativeAI } from '@google/generative-ai'
import fs from 'fs/promises'
import path from 'path'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

export async function generateGeminiResponse(promptText) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' })
    const result = await model.generateContent(promptText)
    const response = result.response
    return response.text()
  } catch (error) {
    console.error('[Gemini Error]', error)
    return '❌ Gemini failed to generate a response.'
  }
}

// Load and chunk local documents
export async function loadChunksFromData() {
  const dataFiles = [
    path.join(__dirname, 'nidData.json'),
    path.join(__dirname, 'passportData.json')
  ]
  let chunks = []
  for (const file of dataFiles) {
    try {
      const content = await fs.readFile(file, 'utf-8')
      const arr = JSON.parse(content)
      chunks = chunks.concat(arr)
    } catch (e) {
      console.error('Failed to load', file, e)
    }
  }
  return chunks
}

// Generate embeddings for an array of texts
export async function generateGeminiEmbeddings(textArray) {
  const model = genAI.getGenerativeModel({ model: 'embedding-001' })
  const embeddings = []
  for (const text of textArray) {
    try {
      const result = await model.embedContent({ content: text })
      embeddings.push(result.embedding.values)
    } catch (e) {
      console.error('Embedding error:', e)
      embeddings.push(null)
    }
  }
  return embeddings
}

// Cosine similarity between two vectors
export function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// Find most relevant chunks for a query embedding
export function findMostRelevantChunks(queryEmbedding, allEmbeddings, chunks, topK = 2) {
  const scored = allEmbeddings.map((emb, i) => ({
    score: emb ? cosineSimilarity(queryEmbedding, emb) : -1,
    chunk: chunks[i]
  }))
  return scored.sort((a, b) => b.score - a.score).slice(0, topK).map(s => s.chunk)
}

// Query Gemini with context
export async function queryGeminiWithContext(userMessage, retrievedChunks) {
  const context = retrievedChunks.map(c => c.text).join('\n---\n')
  const prompt = `You are a helpful government services assistant. Answer the question using the following info:\n\n${context}\n\nQuestion: ${userMessage}`
  return await generateGeminiResponse(prompt)
}
