const express = require('express');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const { Server } = require('socket.io');
require('dotenv').config();

const logger = require('./utils/logger');
const passport = require('./config/passport');
const { addUserToLocals, skipAuthInDev } = require('./middleware/auth');
const { apiLimiter, authLimiter, speedLimiter } = require('./middleware/rateLimit');
const apiRoutes = require('./routes/api');
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');

const app = express();
const server = http.createServer(app);

// Socket.IO with CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || ['http://localhost:3015'];
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'development' && !process.env.ALLOWED_ORIGINS
      ? "*"
      : allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
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

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [];

    // In development, allow all origins if ALLOWED_ORIGINS is not set
    if (process.env.NODE_ENV === 'development' && allowedOrigins.length === 0) {
      return callback(null, true);
    }

    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.length === 0) {
      callback(null, true);
    } else {
      logger.warn('CORS policy blocked origin', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies to be sent
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Load configuration
const config = require('./config/env');

// Session (required for Passport)
const isProduction = config.app.nodeEnv === 'production';
app.use(session({
  secret: config.sessionSecret,
  resave: true,
  saveUninitialized: false,
  name: 'wds-manager.sid',
  cookie: {
    httpOnly: true,
    secure: isProduction || process.env.FORCE_SECURE_COOKIE === 'true',
    sameSite: 'lax', // Allow SSO redirects while protecting against CSRF
    maxAge: 1000 * 60 * 60 * 8, // 8 hours
    path: '/',
    domain: undefined
  },
  proxy: true,
  rolling: true // Reset maxAge on every request
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Development auth skip (optional)
app.use(skipAuthInDev);

// Add user to locals for templates
app.use(addUserToLocals);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Rate limiting
app.use('/auth', authLimiter); // Strict rate limiting for auth endpoints
app.use('/api', speedLimiter); // Speed limiting for API
app.use('/api', apiLimiter); // General rate limiting for API

// Routes (must be before static files to protect index.html)
app.use('/auth', authRoutes);
app.use('/', indexRoutes);
app.use('/api', apiRoutes);

// Static files (after routes so authentication is checked first)
app.use(express.static(path.join(__dirname, '../public')));

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
