/**
 * SSO Service
 * Handles Single Sign-On integration with Operations Portal
 */

const axios = require('axios');
const config = require('../config/env');
const logger = require('../utils/logger');
const roleMappingService = require('./role-mapping-service');

/**
 * Verify SSO token with Operations Portal
 * @param {string} token - JWT token from Operations Portal
 * @returns {Promise<Object>} - User data from SSO verification
 */
async function verifySSOToken(token) {
  const verifyUrl = `${config.sso.portalUrl}${config.sso.verifyPath}`;

  logger.info(`Verifying SSO token with: ${verifyUrl}`);

  try {
    const response = await axios.post(
      verifyUrl,
      { token },
      {
        timeout: config.sso.timeoutMs,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data && response.data.success) {
      // Operations Portal returns user data in response.data.data
      const userData = response.data.data;

      logger.info('SSO token verified successfully:', {
        email: userData?.email,
        displayName: userData?.name || userData?.displayName
      });

      return {
        googleId: userData.googleId,
        email: userData.email,
        displayName: userData.name || userData.displayName,
        firstName: userData.name?.split(' ')[0] || '',
        lastName: userData.name?.split(' ').slice(1).join(' ') || '',
        image: userData.avatarUrl || userData.image || userData.picture || '',
        role: userData.role || 'Viewer',
        ssoVerified: true,
        targetSystem: userData.targetSystem || 'wds-manager'
      };
    } else {
      throw new Error('SSO verification failed: Invalid response format');
    }
  } catch (error) {
    logger.error('SSO token verification error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });

    // Provide specific error messages
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to Operations Portal SSO service');
    } else if (error.code === 'ETIMEDOUT') {
      throw new Error('SSO verification timeout');
    } else if (error.response?.status === 401) {
      throw new Error('Invalid or expired SSO token');
    } else if (error.response?.status === 403) {
      throw new Error('SSO token already used');
    } else if (error.response?.data?.error) {
      throw new Error(`SSO verification failed: ${error.response.data.error}`);
    }

    throw new Error(`SSO verification failed: ${error.message}`);
  }
}

/**
 * Format user data from SSO for session storage
 * @param {Object} ssoUserData - User data from SSO verification
 * @returns {Promise<Object>} - Formatted user object
 */
async function formatUserFromSSO(ssoUserData) {
  // Get roles for this user's email
  const roles = await roleMappingService.getRolesForEmail(ssoUserData.email);

  return {
    googleId: ssoUserData.googleId,
    email: ssoUserData.email,
    displayName: ssoUserData.displayName,
    firstName: ssoUserData.firstName,
    lastName: ssoUserData.lastName,
    image: ssoUserData.image,
    roles: roles,
    loginMethod: 'OPS_PORTAL_SSO',
    lastLogin: new Date().toISOString(),
    ssoVerified: true
  };
}

/**
 * Build a mock SSO user for development/testing
 * @param {string} email - Email address
 * @returns {Promise<Object>} - Mock user object
 */
async function buildMockSsoUser(email) {
  logger.warn('Using MOCK SSO user for development:', email);

  const roles = await roleMappingService.getRolesForEmail(email);

  return {
    googleId: 'mock-google-id-' + Date.now(),
    email: email,
    displayName: email.split('@')[0],
    firstName: email.split('@')[0],
    lastName: 'MockUser',
    image: '',
    roles: roles,
    loginMethod: 'OPS_PORTAL_SSO',
    lastLogin: new Date().toISOString(),
    ssoVerified: false // Mark as not truly verified
  };
}

module.exports = {
  verifySSOToken,
  formatUserFromSSO,
  buildMockSsoUser
};
