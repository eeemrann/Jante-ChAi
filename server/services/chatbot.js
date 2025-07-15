import { mongodb } from '../config/mongodb.js'
import { generateGeminiResponse } from './groq.js'
import { 
  createChatSession, 
  saveMessage, 
  getChatMessages,
  updateChatTitle 
} from '../config/database.js'
import dotenv from 'dotenv'
import { GoogleGenerativeAI } from '@google/generative-ai'
import GovernmentWebScraper from './web-scraper.js'

dotenv.config()
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const GEMINI_MODEL = 'models/gemini-1.5-flash'; // Use a valid Gemini model name

async function safeGenerateGeminiResponse(prompt) {
  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })
    const result = await model.generateContent(prompt)
    const response = result.response
    return response.text()
  } catch (error) {
    if (error.message && error.message.includes('404')) {
      return '❌ Gemini API error: Model not found or unsupported. Please check the model name.'
    }
    console.error('[Gemini Error]', error)
    return '❌ Gemini failed to generate a response.'
  }
}

export class ChatBot {
  constructor(userId) {
    this.userId = userId
    this.currentSessionId = null
    this.webScraper = new GovernmentWebScraper()
    
    // Enhanced system prompt for government services assistant
    this.systemPrompt = `You are Jante ChAi, an advanced AI assistant specialized in Bangladeshi government services. You excel at providing accurate, real-time information by analyzing live data from official government websites.

YOUR CORE EXPERTISE:
- National ID (NID) services & corrections
- Passport services (regular & e-passport)  
- Birth certificate services & registration
- Driving license services & renewal
- Tax services (Income tax, VAT, NBR)
- General government services & procedures

ENHANCED CAPABILITIES:
1. REAL-TIME DATA INTEGRATION: When available, you use live data from government websites
2. CONTEXT-AWARE RESPONSES: You understand user intent (fees, procedures, documents, urgent needs)
3. BILINGUAL SUPPORT: Respond fluently in Bengali or English based on user's language
4. SMART PRIORITIZATION: Focus on the most relevant information for each query
5. PROACTIVE GUIDANCE: Suggest next steps and provide actionable advice

RESPONSE GUIDELINES:
• BE INTELLIGENT: Analyze the user's specific need and provide targeted information
• BE CURRENT: Always mention when you're using real-time data and cite sources
• BE CONCISE: Keep responses focused and under 4-5 sentences when possible
• BE HELPFUL: Ask clarifying questions to provide more precise assistance
• BE ACCURATE: Distinguish between verified real-time data and general guidance

RESPONSE STRUCTURE:
1. Direct answer to the user's question
2. Real-time data (when available) with source citation
3. Key requirements or steps (bullet points)
4. Next action or follow-up question
5. Official website/contact for verification

ENHANCED FEATURES:
- Fee Detection: Automatically provide current fees when discussing services
- Urgency Recognition: Prioritize express/emergency services when needed
- Document Focus: List required documents when users ask about applications
- Process Guidance: Provide step-by-step procedures when requested

EXAMPLES OF ENHANCED RESPONSES:
Query: "passport fee"
Response: "Based on real-time data from passport.gov.bd (retrieved ${new Date().toLocaleDateString()}):
• Regular passport: ৳3,000
• Express service: ৳5,000  
• Police clearance: ৳500

Required: Valid NID, photos, application form
Apply online at: passport.gov.bd

Need help with the application process?"

Query: "কিভাবে জন্ম নিবন্ধন করবো?"
Response: "জন্ম নিবন্ধনের জন্য (bdris.gov.bd থেকে latest তথ্য):

প্রয়োজনীয় কাগজপত্র:
• হাসপাতাল সার্টিফিকেট/জন্ম প্রমাণপত্র
• পিতা-মাতার NID কপি
• ২ কপি ছবি

অনলাইন আবেদন: bdris.gov.bd
ফি: ৳২৫ (সাধারণ), ৳১০০ (জরুরি)

কোন বয়সের জন্য নিবন্ধন দরকার?"

Always strive to be the most helpful and intelligent government services assistant possible.`
  }

  // Start new chat session
  async startNewChat(title = 'New Chat') {
    const { data: sessionId, error } = await createChatSession(title, this.userId)
    if (error) throw new Error(`Failed to create session: ${error.message}`)
    
    this.currentSessionId = sessionId
    return sessionId
  }

  // Load existing chat session
  async loadChat(sessionId) {
    this.currentSessionId = sessionId
    const { data: messages, error } = await getChatMessages(sessionId)
    
    if (error) throw new Error(`Failed to load chat: ${error.message}`)
    return messages
  }

  // Send message and get AI response
  async sendMessage(userMessage, sessionId = null) {
    const targetSessionId = sessionId || this.currentSessionId
    
    if (!targetSessionId) {
      throw new Error('No active chat session')
    }

    try {
      // Save user message
      const { error: userError } = await saveMessage(
        targetSessionId, 
        this.userId,
        'user', 
        userMessage
      )
      if (userError) throw new Error(`Failed to save user message: ${userError.message}`)

      // Get chat history for context
      const { data: chatHistory } = await getChatMessages(targetSessionId)
      
      // Analyze user query for smart data fetching
      const queryAnalysis = this.analyzeUserQuery(userMessage)
      console.log('[DEBUG] Query analysis:', queryAnalysis)
      
      // Try to fetch real-time data from government websites with smart targeting
      let realTimeData = null
      try {
        console.log('[DEBUG] Attempting to fetch real-time data for:', userMessage)
        realTimeData = await this.webScraper.fetchServiceInfo(userMessage)
        if (realTimeData) {
          console.log('[DEBUG] Real-time data fetched successfully')
        } else {
          console.log('[DEBUG] No relevant real-time data found')
        }
      } catch (error) {
        console.log('[DEBUG] Real-time data fetch failed:', error.message)
        // Continue without real-time data
      }

      // Format prompt for Gemini with enhanced context
      const prompt = this.formatPromptForGemini(chatHistory, userMessage, realTimeData, queryAnalysis)

      // Get AI response from Gemini
      const aiResponse = await safeGenerateGeminiResponse(prompt)

      // Save AI response
      const { error: aiError } = await saveMessage(
        targetSessionId, 
        this.userId,
        'assistant', 
        aiResponse
      )
      if (aiError) throw new Error(`Failed to save AI message: ${aiError.message}`)

      // Auto-generate title for first exchange
      if (chatHistory.length === 0) {
        await this.generateChatTitle(targetSessionId, userMessage, aiResponse)
      }

      return {
        response: aiResponse,
        sessionId: targetSessionId,
        hasRealTimeData: !!realTimeData,
        queryType: queryAnalysis.type,
        serviceDetected: queryAnalysis.service
      }

    } catch (error) {
      console.error('Chat error:', error)
      throw error
    }
  }

  // Analyze user query to understand intent and context
  analyzeUserQuery(query) {
    const queryLower = query.toLowerCase()
    const analysis = {
      type: 'general',
      service: null,
      intent: [],
      language: queryLower.match(/[আ-ৎ]/) ? 'bangla' : 'english',
      urgency: 'normal',
      keywords: []
    }

    // Detect service type
    const serviceKeywords = {
      'passport': ['passport', 'travel', 'epassport', 'visa', 'পাসপোর্ট'],
      'nid': ['nid', 'national id', 'voter', 'smart card', 'জাতীয় পরিচয়পত্র', 'ভোটার'],
      'birth_certificate': ['birth certificate', 'birth registration', 'জন্ম নিবন্ধন', 'জন্ম সনদ'],
      'driving_license': ['driving license', 'license', 'brta', 'ড্রাইভিং লাইসেন্স'],
      'tax': ['tax', 'income tax', 'tin', 'vat', 'nbr', 'কর', 'আয়কর']
    }

    for (const [service, keywords] of Object.entries(serviceKeywords)) {
      if (keywords.some(keyword => queryLower.includes(keyword))) {
        analysis.service = service
        analysis.type = 'service_specific'
        break
      }
    }

    // Detect user intent
    const intentPatterns = {
      'fee_inquiry': ['fee', 'cost', 'price', 'charge', 'ফি', 'টাকা', 'খরচ'],
      'document_requirements': ['document', 'required', 'need', 'necessary', 'দরকার', 'প্রয়োজন', 'কাগজপত্র'],
      'process_inquiry': ['how', 'process', 'step', 'procedure', 'কিভাবে', 'প্রক্রিয়া', 'পদ্ধতি'],
      'application': ['apply', 'application', 'submit', 'আবেদন', 'জমা'],
      'status_check': ['status', 'check', 'track', 'অবস্থা', 'চেক'],
      'renewal': ['renew', 'renewal', 'নবায়ন'],
      'correction': ['correct', 'change', 'update', 'সংশোধন', 'পরিবর্তন']
    }

    for (const [intent, patterns] of Object.entries(intentPatterns)) {
      if (patterns.some(pattern => queryLower.includes(pattern))) {
        analysis.intent.push(intent)
      }
    }

    // Detect urgency
    const urgentKeywords = ['urgent', 'emergency', 'fast', 'quick', 'express', 'জরুরি', 'দ্রুত']
    if (urgentKeywords.some(keyword => queryLower.includes(keyword))) {
      analysis.urgency = 'high'
    }

    // Extract key terms
    analysis.keywords = query.split(' ')
      .filter(word => word.length > 3 && !['what', 'where', 'when', 'how', 'the', 'and', 'for'].includes(word.toLowerCase()))
      .slice(0, 5)

    return analysis
  }

  // Format chat history and user message into a prompt string for Gemini
  formatPromptForGemini(chatHistory, userMessage, realTimeData = null, queryAnalysis = null) {
    const messages = [
      { role: 'system', content: this.systemPrompt }
    ]
    
    // Add real-time data if available
    if (realTimeData) {
      messages.push({
        role: 'system',
        content: `REAL-TIME DATA FROM GOVERNMENT WEBSITES:
${realTimeData}

Use this current information to provide accurate, up-to-date responses. Always mention the source when using this data.`
      })
    }

    // Add query analysis context
    if (queryAnalysis) {
      let contextInfo = `USER QUERY ANALYSIS:
- Service Type: ${queryAnalysis.service || 'General'}
- Intent: ${queryAnalysis.intent.join(', ') || 'General inquiry'}
- Language: ${queryAnalysis.language}
- Urgency: ${queryAnalysis.urgency}
- Keywords: ${queryAnalysis.keywords.join(', ')}

RESPONSE INSTRUCTIONS:
`
      
      if (queryAnalysis.intent.includes('fee_inquiry')) {
        contextInfo += '- Focus on providing current fee information with official sources\n'
      }
      if (queryAnalysis.intent.includes('document_requirements')) {
        contextInfo += '- Prioritize listing required documents and forms\n'
      }
      if (queryAnalysis.intent.includes('process_inquiry')) {
        contextInfo += '- Provide step-by-step procedures clearly\n'
      }
      if (queryAnalysis.urgency === 'high') {
        contextInfo += '- Highlight express/urgent service options if available\n'
      }
      if (queryAnalysis.language === 'bangla') {
        contextInfo += '- Respond in Bengali/Bangla language\n'
      }

      messages.push({
        role: 'system',
        content: contextInfo
      })
    }
    
    // Add last 10 messages for context
    const recentHistory = chatHistory.slice(-10)
    messages.push(...recentHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    })))
    messages.push({ role: 'user', content: userMessage })
    
    // Concatenate all messages into a single prompt string
    return messages.map(m => `${m.role === 'system' ? 'SYSTEM: ' : m.role.toUpperCase() + ': '}${m.content}`).join('\n\n')
  }

  // Auto-generate chat title using Gemini
  async generateChatTitle(sessionId, userMessage, aiResponse) {
    try {
      const prompt = `Generate a short, descriptive title (max 50 characters) for this conversation about government services. Only return the title, nothing else.\nUser: ${userMessage}\nAssistant: ${aiResponse}`
      const title = await safeGenerateGeminiResponse(prompt)
      
      if (title) {
        await updateChatTitle(sessionId, title.trim().replace(/['"]/g, ''))
      }
    } catch (error) {
      console.log('Failed to generate title:', error)
      // Don't throw - title generation is optional
    }
  }

  // Get current session
  getCurrentSession() {
    return this.currentSessionId
  }

  // Cleanup resources
  async cleanup() {
    if (this.webScraper) {
      await this.webScraper.cleanup()
    }
  }
}