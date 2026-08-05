const { body, param, query } = require('express-validator');
const { contactPhoneValidation } = require('./facility.validators');

/** Optional first-facility profile fields (create tenant + update tenant). */
const optionalTenantFacilityProfileValidators = [
  body('facilityName')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('Facility name must not exceed 255 characters'),
  body('licenseNumber')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('License number must not exceed 100 characters'),
  body('address')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Address must not exceed 500 characters'),
  body('capacity')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined || value === '') return true;
      const n = parseInt(String(value), 10);
      if (!Number.isFinite(n) || n < 0 || n > 9999) {
        throw new Error('Capacity must be a non-negative integer');
      }
      return true;
    }),
  body('licenseExpirationDate')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('License expiration date must be a valid date'),
  body('profilePhotoUrl')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2048 })
    .withMessage('Profile photo URL must not exceed 2048 characters'),
  contactPhoneValidation('contactInformation'),
  body('contactEmail')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail()
    .withMessage('Enter a valid email address')
    .isLength({ max: 255 })
    .withMessage('Email must not exceed 255 characters'),
  body('website')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2048 })
    .withMessage('Website must not exceed 2048 characters')
    .custom((value) => {
      if (value == null || value === '') return true;
      try {
        const u = value.includes('://') ? value : `https://${value}`;
        // eslint-disable-next-line no-new
        new URL(u);
      } catch {
        throw new Error('Enter a valid website URL');
      }
      return true;
    }),
];

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
    .withMessage('Slug can only contain lowercase letters, numbers, and hyphens'),
  ...optionalTenantFacilityProfileValidators,
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
    .withMessage('Slug can only contain lowercase letters, numbers, and hyphens'),
  ...optionalTenantFacilityProfileValidators,
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

