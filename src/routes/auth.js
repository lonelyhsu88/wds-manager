const express = require('express');
const router = express.Router();
const passport = require('../config/passport');
const logger = require('../utils/logger');
const config = require('../config/env');
const ssoService = require('../services/sso-service');
const { sign } = require('cookie-signature');

/**
 * GET /auth/sso
 * SSO login via Operations Portal
 * Accepts token as query parameter: ?token=<jwt-token>
 */
router.get('/sso', async (req, res) => {
  const { token } = req.query;

  // Check if token is provided
  if (!token) {
    logger.warn('SSO login attempt without token');
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>SSO Login Error</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .error { color: #d32f2f; }
        </style>
      </head>
      <body>
        <h1 class="error">SSO Login Error</h1>
        <p>No SSO token provided. Please login through Operations Portal.</p>
        <a href="${config.sso.portalUrl}">Return to Operations Portal</a>
      </body>
      </html>
    `);
  }

  try {
    // For development: allow mock SSO user
    let user;
    if (config.sso.mockEmail && config.app.nodeEnv === 'development') {
      logger.warn('Using mock SSO for development');
      user = await ssoService.buildMockSsoUser(config.sso.mockEmail);
    } else {
      // Verify token with Operations Portal
      const ssoUserData = await ssoService.verifySSOToken(token);

      // Format user for session
      user = await ssoService.formatUserFromSSO(ssoUserData);
    }

    // Login user with Passport
    req.login(user, (err) => {
      if (err) {
        logger.error('SSO login error:', err);
        return res.status(500).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Login Error</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              .error { color: #d32f2f; }
            </style>
          </head>
          <body>
            <h1 class="error">Login Error</h1>
            <p>Failed to establish session. Please try again.</p>
            <a href="${config.sso.portalUrl}">Return to Operations Portal</a>
          </body>
          </html>
        `);
      }

      // Manually set session cookie (workaround for Passport.js behavior)
      const sessionCookie = req.sessionID;
      const signedCookie = 's:' + sign(sessionCookie, config.sessionSecret);

      const isProduction = config.app.nodeEnv === 'production';
      res.cookie('wds-manager.sid', signedCookie, {
        httpOnly: true,
        secure: isProduction || process.env.FORCE_SECURE_COOKIE === 'true',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 8, // 8 hours
        path: '/',
        domain: undefined
      });

      logger.info('SSO login successful', {
        email: user.email,
        displayName: user.displayName,
        roles: user.roles,
        loginMethod: user.loginMethod
      });

      // Redirect to home page
      res.redirect('/');
    });
  } catch (error) {
    logger.error('SSO verification error:', error);

    let errorMessage = 'SSO verification failed';
    if (error.message.includes('expired')) {
      errorMessage = 'Your SSO token has expired. Please login again.';
    } else if (error.message.includes('already used')) {
      errorMessage = 'This SSO token has already been used. Please login again.';
    } else if (error.message.includes('Cannot connect')) {
      errorMessage = 'Cannot connect to Operations Portal. Please try again later.';
    }

    res.status(401).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>SSO Verification Failed</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .error { color: #d32f2f; }
        </style>
      </head>
      <body>
        <h1 class="error">SSO Verification Failed</h1>
        <p>${errorMessage}</p>
        <a href="${config.sso.portalUrl}">Return to Operations Portal</a>
      </body>
      </html>
    `);
  }
});

/**
 * GET /auth/sso/init (Legacy route for backward compatibility)
 * Redirects to /auth/sso with token
 */
router.get('/sso/init', (req, res) => {
  const token = req.query.token || req.headers['x-ops-portal-token'];

  if (!token) {
    return res.status(400).json({ error: 'No SSO token provided' });
  }

  res.redirect(`/auth/sso?token=${encodeURIComponent(token)}`);
});

/**
 * GET /auth/google
 * Initiate Google OAuth login
 */
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })
);

/**
 * GET /auth/google/callback
 * Google OAuth callback
 */
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login?error=auth_failed'
  }),
  (req, res) => {
    // Manually set session cookie (workaround for Passport.js behavior)
    const sessionCookie = req.sessionID;
    const signedCookie = 's:' + sign(sessionCookie, config.sessionSecret);

    const isProduction = config.app.nodeEnv === 'production';
    res.cookie('wds-manager.sid', signedCookie, {
      httpOnly: true,
      secure: isProduction || process.env.FORCE_SECURE_COOKIE === 'true',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
      path: '/',
      domain: undefined
    });

    logger.info('Google OAuth login successful', {
      email: req.user.email,
      displayName: req.user.displayName,
      roles: req.user.roles,
      loginMethod: req.user.loginMethod
    });

    // Redirect to original URL or home
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  }
);

/**
 * GET /auth/logout
 * Logout user
 */
router.get('/logout', (req, res) => {
  const userEmail = req.user?.email;

  req.logout((err) => {
    if (err) {
      logger.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }

    logger.info(`User logged out: ${userEmail}`);

    req.session.destroy((err) => {
      if (err) {
        logger.error('Session destruction error:', err);
      }
      res.redirect('/login');
    });
  });
});

/**
 * GET /auth/status
 * Check authentication status
 */
router.get('/status', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      authenticated: true,
      user: {
        email: req.user.email,
        displayName: req.user.displayName,
        image: req.user.image || req.user.photo,
        roles: req.user.roles || ['Viewer'],
        loginMethod: req.user.loginMethod || 'OAuth2',
        lastLogin: req.user.lastLogin
      }
    });
  } else {
    res.json({
      authenticated: false
    });
  }
});

/**
 * GET /auth/me
 * Get current user information (more detailed than /auth/status)
 */
router.get('/me', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  res.json({
    email: req.user.email,
    displayName: req.user.displayName,
    firstName: req.user.firstName,
    lastName: req.user.lastName,
    image: req.user.image || req.user.photo,
    roles: req.user.roles || ['Viewer'],
    loginMethod: req.user.loginMethod || 'OAuth2',
    lastLogin: req.user.lastLogin
  });
});

module.exports = router;
