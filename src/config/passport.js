const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const logger = require('../utils/logger');
const config = require('./env');
const roleMappingService = require('../services/role-mapping-service');

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
      clientID: config.google.clientId,
      clientSecret: config.google.clientSecret,
      callbackURL: config.google.callbackUrl,
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
        if (config.google.allowedDomains && config.google.allowedDomains.length > 0) {
          const emailDomain = email.split('@')[1];
          if (!config.google.allowedDomains.includes(emailDomain)) {
            logger.warn(`Google OAuth: Email domain not allowed: ${emailDomain}`);
            return done(null, false, { message: `Email domain ${emailDomain} is not allowed` });
          }
        }

        // Check specific email whitelist
        if (config.google.allowedEmails && config.google.allowedEmails.length > 0) {
          if (!config.google.allowedEmails.includes(email)) {
            logger.warn(`Google OAuth: Email not in whitelist: ${email}`);
            return done(null, false, { message: 'Your email is not authorized to access this system' });
          }
        }

        // Get roles for this user
        const roles = await roleMappingService.getRolesForEmail(email);

        // Create user object
        const user = {
          googleId: profile.id,
          email: email,
          displayName: profile.displayName,
          firstName: profile.name?.givenName,
          lastName: profile.name?.familyName,
          image: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
          roles: roles,
          loginMethod: 'OAuth2',
          lastLogin: new Date().toISOString()
        };

        logger.info(`Google OAuth: User authenticated: ${email}`, { roles });
        return done(null, user);
      } catch (error) {
        logger.error('Google OAuth error:', error);
        return done(error, null);
      }
    }
  )
);

module.exports = passport;
