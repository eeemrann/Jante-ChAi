import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from server/.env
dotenv.config({ path: path.join(__dirname, '../.env') });

class MongoDB {
  constructor() {
    this.client = null;
    this.db = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      if (this.isConnected) {
        return this.db;
      }

      let mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
      const databaseName = process.env.DB_NAME || 'jante-chai';

      // --- TLS/SSL options ---
      const mongoOptions = {
        // Only enable TLS if needed (Atlas usually requires it, but allow override)
        tls: !mongoUri.startsWith('mongodb://localhost'),
        serverApi: { version: '1' }
      };
      // Optionally use a custom CA file for strict enterprise/Windows environments
      if (process.env.MONGODB_CA_FILE && fs.existsSync(process.env.MONGODB_CA_FILE)) {
        mongoOptions.tlsCAFile = process.env.MONGODB_CA_FILE;
        console.log('[INFO] Using custom CA file for MongoDB TLS:', mongoOptions.tlsCAFile);
      }
      // Allow disabling TLS for troubleshooting
      if (process.env.DISABLE_MONGODB_TLS === 'true') {
        mongoOptions.tls = false;
        delete mongoOptions.tlsCAFile;
        console.warn('[WARN] TLS is disabled for MongoDB connection (not recommended for production)');
      }

      console.log('[INFO] Connecting to MongoDB for ChatBot service...');
      console.log('[INFO] Using database:', databaseName);
      this.client = new MongoClient(mongoUri, mongoOptions);
      await this.client.connect();
      this.db = this.client.db(databaseName);
      this.isConnected = true;
      console.log('✅ ChatBot MongoDB connection established');
      await this.createIndexes();
      return this.db;
    } catch (error) {
      if (error.message && error.message.toLowerCase().includes('tls')) {
        console.error('❌ MongoDB TLS/SSL error:', error);
        console.error('If you are on Windows, ensure your system CA certificates are up to date.');
        console.error('If you use antivirus/firewall, ensure it does not intercept SSL.');
        console.error('If you are in a strict enterprise environment, set MONGODB_CA_FILE in .env to the Atlas CA PEM file.');
      } else {
        console.error('❌ ChatBot MongoDB connection error:', error);
      }
      throw error;
    }
  }

  async createIndexes() {
    try {
      // Users collection indexes
      await this.db.collection('users').createIndex({ email: 1 }, { unique: true });
      await this.db.collection('users').createIndex({ mobile: 1 }, { unique: true, sparse: true });
      
      // Chat sessions indexes
      await this.db.collection('chat_sessions').createIndex({ userId: 1 });
      await this.db.collection('chat_sessions').createIndex({ createdAt: -1 });
      
      // Messages indexes
      await this.db.collection('messages').createIndex({ sessionId: 1 });
      await this.db.collection('messages').createIndex({ createdAt: 1 });
      
      console.log('✅ Database indexes created');
    } catch (error) {
      console.warn('⚠️ Some indexes may already exist:', error.message);
    }
  }

  getDb() {
    if (!this.isConnected || !this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.db;
  }

  // Auth helper methods
  async hashPassword(password) {
    return await bcrypt.hash(password, 12);
  }

  async comparePassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  // Simplified user authentication methods
  async signUp(email, password, fullName, mobile = null) {
    try {
      const db = this.getDb();
      
      // Check if user already exists
      const existingUser = await db.collection('users').findOne({ email });
      if (existingUser) {
        return { 
          data: null, 
          error: { message: 'User with this email already exists' }
        };
      }

      // Hash password
      const hashedPassword = await this.hashPassword(password);

      // Create user
      const newUser = {
        email,
        password: hashedPassword,
        fullName,
        mobile,
        createdAt: new Date(),
        updatedAt: new Date(),
        isVerified: true, // Auto-verify for simplicity
        lastLogin: null
      };

      const result = await db.collection('users').insertOne(newUser);

      return {
        data: {
          user: {
            id: result.insertedId,
            email,
            fullName,
            mobile,
            createdAt: newUser.createdAt,
            isVerified: newUser.isVerified
          }
        },
        error: null
      };

    } catch (error) {
      return { 
        data: null, 
        error: { message: error.message }
      };
    }
  }

  async signIn(email, password) {
    try {
      const db = this.getDb();
      
      // Find user
      const user = await db.collection('users').findOne({ email });
      if (!user) {
        return { 
          data: null, 
          error: { message: 'Invalid email or password' }
        };
      }

      // Check password
      const isValidPassword = await this.comparePassword(password, user.password);
      if (!isValidPassword) {
        return { 
          data: null, 
          error: { message: 'Invalid email or password' }
        };
      }

      // Update last login
      await db.collection('users').updateOne(
        { _id: user._id },
        { 
          $set: { 
            lastLogin: new Date(),
            updatedAt: new Date()
          }
        }
      );

      return {
        data: {
          user: {
            id: user._id,
            email: user.email,
            fullName: user.fullName,
            mobile: user.mobile,
            createdAt: user.createdAt,
            lastLogin: new Date(),
            isVerified: user.isVerified
          }
        },
        error: null
      };

    } catch (error) {
      return { 
        data: null, 
        error: { message: error.message }
      };
    }
  }

  async getCurrentUser(userId) {
    try {
      const db = this.getDb();
      const user = await db.collection('users').findOne(
        { _id: new ObjectId(userId) },
        { projection: { password: 0 } }
      );

      if (!user) {
        return { data: null, error: { message: 'User not found' } };
      }

      return {
        data: {
          id: user._id,
          email: user.email,
          fullName: user.fullName,
          mobile: user.mobile,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLogin: user.lastLogin,
          isVerified: user.isVerified
        },
        error: null
      };

    } catch (error) {
      return { 
        data: null, 
        error: { message: error.message }
      };
    }
  }

  // Utility method to create ObjectId
  createObjectId(id) {
    return new ObjectId(id);
  }
}

// Create and export singleton instance
const mongodb = new MongoDB();
export { mongodb, ObjectId };
