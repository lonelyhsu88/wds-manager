const express = require('express');
const path = require('path');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');

// Login page
router.get('/login', (req, res) => {
  // If already authenticated, redirect to home
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, '../../public/login.html'));
});

// Serve main page (requires authentication)
router.get('/', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

module.exports = router;
