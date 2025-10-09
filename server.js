require('dotenv').config(); // Add this at the top
const express = require('express');
const cors = require('cors');
const http = require('http');
const app = express();

// Parse allowed origins from environment variable
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:8081', 'exp://localhost:8081'];

// Enhanced CORS configuration
app.use(cors({ 
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}. Allowed origins: ${allowedOrigins.join(', ')}`;
      console.warn('CORS blocked:', origin);
      return callback(new Error(msg), false);
    }
    console.log('CORS allowed:', origin);
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json());

// Import routes
const categoriesRoutes = require('./routes/categories');
const itemsRoutes = require('./routes/items');
const topicsRoutes = require("./routes/topics");
const lobbiesRoutes = require('./routes/lobbies');
const playersRoutes = require('./routes/players');

app.use('/categories', categoriesRoutes);
app.use('/items', itemsRoutes);
app.use("/topics", topicsRoutes);
app.use('/lobbies', lobbiesRoutes);
app.use('/players', playersRoutes);
app.use('/auth', require('./routes/auth'));

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    redis: process.env.REDIS_URL ? 'configured' : 'not configured'
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'NameIt Backend API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = require('socket.io')(server, {
  cors: { 
    origin: process.env.NODE_ENV === 'production' ? false : "*", // More restrictive in production
    methods: ['GET','POST'] 
  },
  // Production optimizations
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

// Import and init socket logic
const initSocket = require('./socket');
initSocket(io);

// Start server
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Always bind to all interfaces

server.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Redis: ${process.env.REDIS_URL ? 'configured' : 'local'}`);
  console.log(`✅ Health check: http://${HOST}:${PORT}/health`);
  console.log(`🎯 Socket.IO: WebSocket server ready`);
});