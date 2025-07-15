import { mongodb } from './server/config/mongodb.js';
import app from './server/server.js';

const PORT = process.env.PORT || 3000;

async function startLocalServer() {
    try {
        console.log('\n[INFO] Starting Jante CH-AI Local Development Server...');
        console.log('[INFO] Initializing services...\n');
        
        // Initialize MongoDB
        await mongodb.connect();
        console.log('[INFO] MongoDB connected successfully');
        
        // Start Express server
        const server = app.listen(PORT, () => {
            const actualPort = server.address().port;
            console.log('\n' + '='.repeat(60));
            console.log('JANTE CH-AI LOCAL SERVER STARTED');
            console.log('='.repeat(60));
            console.log(`Server URL: http://localhost:${actualPort}`);
            console.log(`Started at: ${new Date().toLocaleString()}`);
            console.log('='.repeat(60) + '\n');
        }).on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`[WARN] Port ${PORT} is in use, trying port ${PORT + 1}...`);
                app.listen(PORT + 1, () => {
                    console.log(`Server running on http://localhost:${PORT + 1}`);
                });
            } else {
                console.error('[ERROR] Server error:', err);
                process.exit(1);
            }
        });
        
    } catch (error) {
        console.error('[ERROR] Failed to start server:', error);
        process.exit(1);
    }
}

// Shutdown handler
process.on('SIGINT', () => {
    console.log('\n[INFO] Server shutting down...');
    process.exit(0);
});

// Start the server
if (process.env.NODE_ENV !== 'production') {
    startLocalServer();
}
