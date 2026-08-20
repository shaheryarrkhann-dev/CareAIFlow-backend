const express = require("express");
const router = express.Router();
const validate = require("../../middlewares/validate.middleware");
const { visitorSignInSubmitLimiter } = require("../../middlewares/rateLimit.middleware");
const visitorSignInController = require("../../controllers/public/visitor-sign-in.controller");
const {
  tokenQueryValidator,
  submitValidator,
} = require("../../validators/public-visitor-sign-in.validators");

router.get(
  "/config",
  validate(tokenQueryValidator),
  visitorSignInController.getConfig
);

router.get(
  "/logo",
  validate(tokenQueryValidator),
  visitorSignInController.getLogo
);

router.post(
  "/submit",
  visitorSignInSubmitLimiter,
  validate(submitValidator),
  visitorSignInController.submit
);

module.exports = router;
