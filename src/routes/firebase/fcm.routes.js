const express = require("express");
const router = express.Router();
const authenticate = require("../../middlewares/auth.middleware");
const fcmController = require("../../controllers/firebase/fcm.controller");

router.use(authenticate());

// Register FCM token for push notifications
router.post("/register", fcmController.register);

// Unregister FCM token (on logout / permission revoke)
router.post("/unregister", fcmController.unregister);

module.exports = router;
