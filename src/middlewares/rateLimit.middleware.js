const rateLimit = require("express-rate-limit");

/**
 * General API rate limiter
 * Increased limits for better user experience
 */
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  // max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // Increased from 100 to 1000
  max: 1000,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Suppress trust proxy warnings in development
});

/**
 * Strict rate limiter for authentication endpoints
 * Increased limits to reduce frustration during development/testing
 */
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS) || 50, // Increased from 20 to 50
  message: {
    success: false,
    message:
      "Too many authentication attempts, please try again after 15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  validate: false, // Suppress trust proxy warnings in development
});

/**
 * Password reset rate limiter
 * Increased from 3 to 10 attempts per hour
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Increased from 3 to 10
  message: {
    success: false,
    message: "Too many password reset requests, please try again after an hour",
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Suppress trust proxy warnings in development
});

/**
 * Public visitor QR sign-in submit: limit per IP to prevent abuse
 */
const visitorSignInSubmitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.RATE_LIMIT_VISITOR_SIGNIN_MAX) || 30,
  message: {
    success: false,
    message: "Too many sign-in attempts. Please try again later or check in at the desk.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

module.exports = {
  apiLimiter,
  authLimiter,
  passwordResetLimiter,
  visitorSignInSubmitLimiter,
};
