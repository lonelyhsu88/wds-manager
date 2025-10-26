const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const logger = require('../utils/logger');

/**
 * General API rate limiter
 * Limits requests to prevent abuse
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('user-agent')
    });
    res.status(429).json({
      error: 'Too many requests',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

/**
 * Strict rate limiter for authentication endpoints
 * Prevents brute force attacks
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  skipSuccessfulRequests: true, // Don't count successful requests
  message: {
    error: 'Too many login attempts',
    message: 'Too many failed login attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      path: req.path
    });
    res.status(429).json({
      error: 'Too many login attempts',
      message: 'Too many failed login attempts, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

/**
 * Strict rate limiter for deployment operations
 * Limits deployment frequency
 */
const deployLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Limit to 10 deployments per 5 minutes
  skipFailedRequests: true, // Don't count failed requests
  message: {
    error: 'Too many deployment requests',
    message: 'Too many deployments, please wait before deploying again.',
    retryAfter: '5 minutes'
  },
  handler: (req, res) => {
    logger.warn('Deploy rate limit exceeded', {
      ip: req.ip,
      user: req.user?.email,
      artifactsCount: req.body.artifactKeys?.length
    });
    res.status(429).json({
      error: 'Too many deployment requests',
      message: 'Too many deployments, please wait before deploying again.',
      retryAfter: '5 minutes'
    });
  }
});

/**
 * Speed limiter - slows down repeated requests
 * More gentle than rate limiting
 */
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // Allow 50 requests per windowMs without slowing down
  delayMs: (hits) => hits * 100, // Add 100ms delay per request after delayAfter
  maxDelayMs: 5000 // Maximum delay of 5 seconds
});

module.exports = {
  apiLimiter,
  authLimiter,
  deployLimiter,
  speedLimiter
};
