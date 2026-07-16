/**
 * Validation middleware
 * Runs express-validator validators
 */
module.exports = (validators) => {
  return async (req, res, next) => {
    await Promise.all(validators.map((validator) => validator.run(req)));
    next();
  };
};
