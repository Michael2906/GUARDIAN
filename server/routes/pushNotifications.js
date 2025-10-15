const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const pushNotificationService = require("../services/pushNotificationService");

/**
 * Push Notification Routes
 * Handles Web Push subscription management and notifications
 */

/**
 * GET /api/push/vapid-public-key
 * Get VAPID public key for push subscription
 */
router.get("/vapid-public-key", (req, res) => {
  try {
    const publicKey = pushNotificationService.getVapidPublicKey();
    res.json({
      success: true,
      publicKey,
    });
  } catch (error) {
    console.error("Error getting VAPID public key:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get VAPID public key",
    });
  }
});

/**
 * POST /api/push/subscribe
 * Subscribe to push notifications
 */
router.post("/subscribe", authenticateToken, async (req, res) => {
  try {
    const { subscription } = req.body;
    const userId = req.user.id;
    const userAgent = req.get("User-Agent") || "Unknown";

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({
        success: false,
        error: "Invalid subscription object",
      });
    }

    const result = await pushNotificationService.addPushSubscription(
      userId,
      subscription,
      userAgent
    );

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Error subscribing to push notifications:", error);
    res.status(500).json({
      success: false,
      error: "Failed to subscribe to push notifications",
    });
  }
});

/**
 * DELETE /api/push/unsubscribe
 * Unsubscribe from push notifications
 */
router.delete("/unsubscribe", authenticateToken, async (req, res) => {
  try {
    const { endpoint } = req.body;
    const userId = req.user.id;

    if (!endpoint) {
      return res.status(400).json({
        success: false,
        error: "Endpoint is required",
      });
    }

    const result = await pushNotificationService.removePushSubscription(
      userId,
      endpoint
    );

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Error unsubscribing from push notifications:", error);
    res.status(500).json({
      success: false,
      error: "Failed to unsubscribe from push notifications",
    });
  }
});

/**
 * POST /api/push/test
 * Send test push notification
 */
router.post("/test", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pushNotificationService.testPushNotification(userId);

    if (result.success) {
      res.json({
        success: true,
        message: "Test notification sent successfully",
        results: result.results,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Error sending test push notification:", error);
    res.status(500).json({
      success: false,
      error: "Failed to send test notification",
    });
  }
});

/**
 * POST /api/push/approve-login/:sessionId
 * Approve login via push notification
 */
router.post(
  "/approve-login/:sessionId",
  authenticateToken,
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { action } = req.body; // 'approve' or 'deny'
      const userId = req.user.id;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: "Session ID is required",
        });
      }

      if (action !== "approve" && action !== "deny") {
        return res.status(400).json({
          success: false,
          error: "Action must be approve or deny",
        });
      }

      // Here you would implement the logic to handle the approval/denial
      // This could involve updating a temporary session store, database record, etc.

      // For now, we'll just return success
      res.json({
        success: true,
        message: `Login ${action}d successfully`,
        sessionId,
        action,
      });
    } catch (error) {
      console.error("Error processing login approval:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process login approval",
      });
    }
  }
);

module.exports = router;
