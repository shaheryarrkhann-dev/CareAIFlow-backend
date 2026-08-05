const {
  registerFcmToken,
  removeFcmToken,
} = require("../../services/firebase/firebase-push.service");

async function register(req, res) {
  try {
    const { token } = req.body;
    if (!token) {
      return res
        .status(400)
        .json({ success: false, message: "FCM token is required" });
    }

    await registerFcmToken(req.user.id, token);
    res.json({ success: true, message: "FCM token registered" });
  } catch (err) {
    console.error("[FCM] Register token error:", err.message);
    res.status(500).json({ success: false, message: "Failed to register token" });
  }
}

async function unregister(req, res) {
  try {
    const { token } = req.body;
    if (!token) {
      return res
        .status(400)
        .json({ success: false, message: "FCM token is required" });
    }

    await removeFcmToken(req.user.id, token);
    res.json({ success: true, message: "FCM token removed" });
  } catch (err) {
    console.error("[FCM] Unregister token error:", err.message);
    res.status(500).json({ success: false, message: "Failed to remove token" });
  }
}

module.exports = { register, unregister };
