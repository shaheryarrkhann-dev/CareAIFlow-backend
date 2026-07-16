const { body, param, query } = require('express-validator');

/**
 * Create tenant validation
 */
const createTenantValidator = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Organization name must be between 2 and 100 characters'),
  body('slug')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Slug must be between 2 and 50 characters')
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Slug can only contain lowercase letters, numbers, and hyphens')
];

/**
 * Update tenant validation
 */
const updateTenantValidator = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Organization name must be between 2 and 100 characters'),
  body('slug')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Slug must be between 2 and 50 characters')
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Slug can only contain lowercase letters, numbers, and hyphens')
];

/**
 * Tenant ID param validation
 */
const tenantIdValidator = [
  param('id')
    .isUUID()
    .withMessage('Invalid organization ID format')
];

/**
 * Pagination query validation
 */
const paginationValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search term must not exceed 100 characters')
];

module.exports = {
  createTenantValidator,
  updateTenantValidator,
  tenantIdValidator,
  paginationValidator
};

