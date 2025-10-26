const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const logger = require('../utils/logger');

// Serialize user to session
passport.serializeUser((user, done) => {
  done(null, user);
});

// Deserialize user from session
passport.deserializeUser((user, done) => {
  done(null, user);
});

// Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3015/auth/google/callback',
      passReqToCallback: true
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        // Extract user information
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;

        if (!email) {
          logger.warn('Google OAuth: No email found in profile');
          return done(null, false, { message: 'No email associated with this Google account' });
        }

        // Check email domain restrictions
        const allowedDomains = process.env.ALLOWED_EMAIL_DOMAINS?.split(',').map(d => d.trim());
        if (allowedDomains && allowedDomains.length > 0) {
          const emailDomain = email.split('@')[1];
          if (!allowedDomains.includes(emailDomain)) {
            logger.warn(`Google OAuth: Email domain not allowed: ${emailDomain}`);
            return done(null, false, { message: `Email domain ${emailDomain} is not allowed` });
          }
        }

        // Check specific email whitelist
        const allowedEmails = process.env.ALLOWED_EMAILS?.split(',').map(e => e.trim()).filter(e => e);
        if (allowedEmails && allowedEmails.length > 0) {
          if (!allowedEmails.includes(email)) {
            logger.warn(`Google OAuth: Email not in whitelist: ${email}`);
            return done(null, false, { message: 'Your email is not authorized to access this system' });
          }
        }

        // Create user object
        const user = {
          id: profile.id,
          email: email,
          displayName: profile.displayName,
          firstName: profile.name?.givenName,
          lastName: profile.name?.familyName,
          photo: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
          provider: 'google',
          loginAt: new Date().toISOString()
        };

        logger.info(`Google OAuth: User authenticated: ${email}`);
        return done(null, user);
      } catch (error) {
        logger.error('Google OAuth error:', error);
        return done(error, null);
      }
    }
  )
);

module.exports = passport;
