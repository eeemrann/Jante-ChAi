import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import serverless from 'serverless-http';

import AuthenticationService from '../server/controllers/auth.js';
import { ChatBot } from '../server/services/chatbot.js';
import { getUserChatSessions } from '../server/config/database.js';
import { mongodb } from '../server/config/mongodb.js';
import { generateGeminiResponse, loadChunksFromData, generateGeminiEmbeddings, cosineSimilarity, findMostRelevantChunks, queryGeminiWithContext } from '../server/services/groq.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Initialize Auth Service
const authService = new AuthenticationService();

// Middleware
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL : true,
    credentials: true
}));
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, '..')));

// Serve CSS files with correct MIME type
app.use('/assets/styles', express.static(path.join(__dirname, '../assets/styles'), {
    setHeaders: function (res, filePath) {
        if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
    }
}));

// Serve other static assets
app.use('/assets', express.static(path.join(__dirname, '../assets')));
app.use('/js', express.static(path.join(__dirname, '../js')));

// Database connection helper
async function connectToDatabase() {
    try {
        await mongodb.connect();
        console.log('[INFO] MongoDB connected successfully');
    } catch (error) {
        console.error('[ERROR] MongoDB connection failed:', error);
        throw error;
    }
}

// Ensure database connection
let dbConnected = false;
async function ensureDbConnection() {
    if (!dbConnected) {
        await connectToDatabase();
        dbConnected = true;
    }
}

// Test route
app.get('/api/test', async (req, res) => {
    try {
        await ensureDbConnection();
        res.json({
            success: true,
            message: 'Server is running!',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Database connection failed'
        });
    }
});

// Auth routes
app.post('/api/auth/register', async (req, res) => {
    try {
        await ensureDbConnection();
        const { email, password, name } = req.body;
        
        if (!email || !password || !name) {
            return res.status(400).json({
                success: false,
                error: 'All fields are required'
            });
        }

        const result = await authService.register({ email, password, name });
        
        if (result.success) {
            res.status(201).json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('[ERROR] Registration error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        await ensureDbConnection();
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        const result = await authService.login({ email, password });
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(401).json(result);
        }
    } catch (error) {
        console.error('[ERROR] Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

app.post('/api/auth/logout', async (req, res) => {
    try {
        const token = req.headers.authorization;
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'No token provided'
            });
        }

        const result = await authService.logout(token);
        res.json(result);
    } catch (error) {
        console.error('[ERROR] Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

app.get('/api/auth/profile', async (req, res) => {
    try {
        await ensureDbConnection();
        const token = req.headers.authorization;
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'No token provided'
            });
        }

        const result = await authService.verifyAuthToken(token);
        
        if (result.success) {
            res.json({
                success: true,
                user: result.user
            });
        } else {
            res.status(401).json(result);
        }
    } catch (error) {
        console.error('[ERROR] Profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

app.put('/api/auth/profile', async (req, res) => {
    try {
        await ensureDbConnection();
        const token = req.headers.authorization;
        const { name, email } = req.body;
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'No token provided'
            });
        }

        const authResult = await authService.verifyAuthToken(token);
        if (!authResult.success) {
            return res.status(401).json(authResult);
        }

        const result = await authService.updateProfile(authResult.user.id, { name, email });
        res.json(result);
    } catch (error) {
        console.error('[ERROR] Update profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

app.post('/api/auth/change-password', async (req, res) => {
    try {
        await ensureDbConnection();
        const token = req.headers.authorization;
        const { currentPassword, newPassword } = req.body;
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'No token provided'
            });
        }

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                error: 'Current password and new password are required'
            });
        }

        const authResult = await authService.verifyAuthToken(token);
        if (!authResult.success) {
            return res.status(401).json(authResult);
        }

        const result = await authService.changePassword(authResult.user.id, currentPassword, newPassword);
        res.json(result);
    } catch (error) {
        console.error('[ERROR] Change password error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Chat routes
app.get('/api/chat/sessions', async (req, res) => {
    try {
        await ensureDbConnection();
        const token = req.headers.authorization;
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'No token provided'
            });
        }

        const authResult = await authService.verifyAuthToken(token);
        if (!authResult.success) {
            return res.status(401).json(authResult);
        }

        const result = await getUserChatSessions(authResult.user.id);
        
        if (result.error) {
            return res.status(500).json({
                success: false,
                error: result.error
            });
        }

        res.json({
            success: true,
            data: result.data
        });

    } catch (error) {
        console.error('[ERROR] Get chat sessions error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

app.post('/api/chat/message', async (req, res) => {
    try {
        await ensureDbConnection();
        const token = req.headers.authorization;
        
        const authResult = await authService.verifyAuthToken(token);
        if (!authResult.success) {
            return res.status(401).json(authResult);
        }

        const { message, sessionId } = req.body;
        
        if (!message) {
            return res.status(400).json({
                success: false,
                error: 'Message is required'
            });
        }

        const chatBot = new ChatBot(authResult.user.id);
        
        let targetSessionId = sessionId;
        if (!targetSessionId) {
            targetSessionId = await chatBot.startNewChat();
        }

        const response = await chatBot.sendMessage(message, targetSessionId);
        await chatBot.cleanup();

        res.json({
            success: true,
            data: {
                response: response.response,
                sessionId: response.sessionId,
                hasRealTimeData: response.hasRealTimeData,
                usage: response.usage
            }
        });

    } catch (error) {
        console.error('[ERROR] Chat message error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/chat/new-session', async (req, res) => {
    try {
        await ensureDbConnection();
        const token = req.headers.authorization;
        
        const authResult = await authService.verifyAuthToken(token);
        if (!authResult.success) {
            return res.status(401).json(authResult);
        }

        const { title } = req.body;
        
        const chatBot = new ChatBot(authResult.user.id);
        const sessionId = await chatBot.startNewChat(title || 'New Chat');
        await chatBot.cleanup();

        res.json({
            success: true,
            data: { sessionId }
        });

    } catch (error) {
        console.error('[ERROR] New chat session error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// RAG endpoint
app.post('/api/ask', async (req, res) => {
    try {
        await ensureDbConnection();
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ success: false, error: 'Message is required' });
        }

        const chunks = await loadChunksFromData();
        
        // Try to load cached embeddings
        const EMBEDDINGS_PATH = path.join(__dirname, '../server/services/embeddings.json');
        let embeddingsCache = {};
        try {
            const cacheRaw = await fs.readFile(EMBEDDINGS_PATH, 'utf-8');
            embeddingsCache = JSON.parse(cacheRaw);
        } catch (e) {
            embeddingsCache = {};
        }

        let allEmbeddings = [];
        let needsUpdate = false;
        if (!embeddingsCache.ids || embeddingsCache.ids.length !== chunks.length) {
            const texts = chunks.map(c => c.text);
            allEmbeddings = await generateGeminiEmbeddings(texts);
            embeddingsCache = {
                ids: chunks.map(c => c.id),
                embeddings: allEmbeddings
            };
            needsUpdate = true;
        } else {
            allEmbeddings = embeddingsCache.embeddings;
        }

        if (needsUpdate) {
            await fs.writeFile(EMBEDDINGS_PATH, JSON.stringify(embeddingsCache, null, 2), 'utf-8');
        }

        const queryEmbeddingArr = await generateGeminiEmbeddings([message]);
        const queryEmbedding = queryEmbeddingArr[0];
        const topChunks = findMostRelevantChunks(queryEmbedding, allEmbeddings, chunks, 2);
        const answer = await queryGeminiWithContext(message, topChunks);
        
        res.json({ success: true, answer });
    } catch (error) {
        console.error('[RAG /api/ask error]', error);
        res.status(500).json({ success: false, error: 'Failed to generate answer' });
    }
});

// Serve HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../pages/homepage.html'));
});

app.get('/homepage', (req, res) => {
    res.sendFile(path.join(__dirname, '../pages/homepage.html'));
});

app.get('/homepage.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../pages/homepage.html'));
});

app.get('/auth', (req, res) => {
    res.sendFile(path.join(__dirname, '../pages/auth.html'));
});

app.get('/auth.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../pages/auth.html'));
});

app.get('/user', (req, res) => {
    res.sendFile(path.join(__dirname, '../pages/user.html'));
});

app.get('/user.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../pages/user.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../pages/user.html'));
});

// Catch-all handler
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, '../pages/homepage.html'));
});

export default serverless(app);
