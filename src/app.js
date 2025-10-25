const express = require('express');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const { Server } = require('socket.io');
require('dotenv').config();

const logger = require('./utils/logger');
const apiRoutes = require('./routes/api');
const indexRoutes = require('./routes/index');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const PORT = process.env.PORT || 3000;

// Make io accessible to routes
app.set('io', io);

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
    }
  }
}));

// CORS
app.use(cors());

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Routes
app.use('/', indexRoutes);
app.use('/api', apiRoutes);

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
server.listen(PORT, () => {
  logger.info(`WebUI Deployment System Manager started on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`AWS Profile: ${process.env.AWS_PROFILE || 'default'}`);
  logger.info(`WebSocket server ready`);

  // Check bucket access on startup
  const s3Service = require('./services/s3Service');
  const { buckets } = require('./config/aws');

  Promise.all([
    s3Service.checkBucketAccess(buckets.buildArtifacts),
    s3Service.checkBucketAccess(buckets.deployWebUI)
  ]).then(([buildAccess, deployAccess]) => {
    logger.info(`Build artifacts bucket (${buckets.buildArtifacts}): ${buildAccess ? 'accessible' : 'NOT accessible'}`);
    logger.info(`Deploy WebUI bucket (${buckets.deployWebUI}): ${deployAccess ? 'accessible' : 'NOT accessible'}`);
  }).catch(err => {
    logger.error('Error checking bucket access on startup:', err);
  });
});

module.exports = app;
