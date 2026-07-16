const jwt = require('jsonwebtoken');

const signAccessToken = (payload) =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '2d' // Changed from 15m to 2 days
  });

const signRefreshToken = (payload) =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || '30d'
  });

const signResetPasswordToken = (payload) =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_RESET_PASSWORD_EXPIRES || '1h'
  });

const verifyAccessToken = (token) =>
  jwt.verify(token, process.env.JWT_ACCESS_SECRET);

const verifyRefreshToken = (token) =>
  jwt.verify(token, process.env.JWT_REFRESH_SECRET);

const verifyResetPasswordToken = (token) =>
  jwt.verify(token, process.env.JWT_ACCESS_SECRET);

const signEmailVerificationToken = (payload) =>
  jwt.sign({ ...payload, type: 'email-verification' }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: '24h'
  });

const verifyEmailVerificationToken = (token) =>
  jwt.verify(token, process.env.JWT_ACCESS_SECRET);

const signPasswordChangeToken = (payload) =>
  jwt.sign({ ...payload, type: 'password-change' }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: '1h'
  });

const verifyPasswordChangeToken = (token) =>
  jwt.verify(token, process.env.JWT_ACCESS_SECRET);

module.exports = {
  signAccessToken,
  signRefreshToken,
  signResetPasswordToken,
  verifyAccessToken,
  verifyRefreshToken,
  verifyResetPasswordToken,
  signEmailVerificationToken,
  verifyEmailVerificationToken,
  signPasswordChangeToken,
  verifyPasswordChangeToken
};
