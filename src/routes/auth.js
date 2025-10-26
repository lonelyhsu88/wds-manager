const express = require('express');
const router = express.Router();
const passport = require('../config/passport');
const logger = require('../utils/logger');

/**
 * GET /auth/google
 * Initiate Google OAuth login
 */
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email']
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
    logger.info(`User logged in: ${req.user.email}`, {
      userId: req.user.id,
      displayName: req.user.displayName
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
        photo: req.user.photo
      }
    });
  } else {
    res.json({
      authenticated: false
    });
  }
});

module.exports = router;
