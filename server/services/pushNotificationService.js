const webpush = require("web-push");
const { User } = require("../models");

/**
 * Push Notification Service for 2FA
 *
 * Handles Web Push notifications for two-factor authentication
 */

// Configure web-push with VAPID keys
// In production, these should be stored in environment variables
const vapidKeys = {
  publicKey:
    process.env.VAPID_PUBLIC_KEY ||
    "BIDwynQznM7o4LoOLmsb63ExbzrTBjf7tlikHkvoRrDCv2yAjwlrHqmgdl79FkBR66hKo6-rZQB8iStqdvBjgh4",
  privateKey:
    process.env.VAPID_PRIVATE_KEY ||
    "YkodvkUHDEV4vYwPuLh13s7i9YgeFxfliv_9EN0opSA",
};

webpush.setVapidDetails(
  "mailto:admin@guardianplatform.com",
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

/**
 * Send 2FA Push Notification
 * @param {string} userId - User ID
 * @param {Object} notificationData - Notification content
 */
async function send2FAPushNotification(userId, notificationData) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.twoFactorAuth.pushNotifications.enabled) {
      return {
        success: false,
        error: "Push notifications not enabled for user",
      };
    }

    const subscriptions =
      user.twoFactorAuth.pushNotifications.subscriptions || [];
    if (subscriptions.length === 0) {
      return { success: false, error: "No push subscriptions found" };
    }

    const payload = JSON.stringify({
      title: "🔐 GUARDIAN 2FA Login Attempt",
      body:
        notificationData.body || "Someone is trying to log in to your account",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: "2fa-login",
      requireInteraction: true,
      actions: [
        {
          action: "approve",
          title: "✅ Approve",
          icon: "/icons/check.png",
        },
        {
          action: "deny",
          title: "❌ Deny",
          icon: "/icons/close.png",
        },
      ],
      data: {
        type: "2fa-login-attempt",
        userId: userId,
        timestamp: Date.now(),
        sessionId: notificationData.sessionId,
        location: notificationData.location || "Unknown location",
        userAgent: notificationData.userAgent || "Unknown device",
      },
    });

    const results = [];
    const failedSubscriptions = [];

    // Send to all subscriptions
    for (const subscription of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: subscription.endpoint,
          keys: subscription.keys,
        };

        await webpush.sendNotification(pushSubscription, payload);
        results.push({ success: true, endpoint: subscription.endpoint });
      } catch (error) {
        console.error("Failed to send push notification:", error);
        results.push({
          success: false,
          endpoint: subscription.endpoint,
          error: error.message,
        });

        // If subscription is invalid, mark for removal
        if (error.statusCode === 410 || error.statusCode === 404) {
          failedSubscriptions.push(subscription);
        }
      }
    }

    // Clean up invalid subscriptions
    if (failedSubscriptions.length > 0) {
      user.twoFactorAuth.pushNotifications.subscriptions = subscriptions.filter(
        (sub) =>
          !failedSubscriptions.some(
            (failed) => failed.endpoint === sub.endpoint
          )
      );
      await user.save();
    }

    return {
      success: true,
      results,
      sentCount: results.filter((r) => r.success).length,
      failedCount: results.filter((r) => !r.success).length,
    };
  } catch (error) {
    console.error("Error sending 2FA push notification:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send 2FA Approval Request
 * @param {string} userId - User ID
 * @param {string} sessionId - Temporary session ID
 * @param {Object} loginInfo - Login attempt information
 */
async function send2FAApprovalRequest(userId, sessionId, loginInfo = {}) {
  const notificationData = {
    body: `Login attempt from ${
      loginInfo.location || "unknown location"
    }. Tap to approve or deny.`,
    sessionId,
    location: loginInfo.location,
    userAgent: loginInfo.userAgent,
  };

  return await send2FAPushNotification(userId, notificationData);
}

/**
 * Send Security Alert
 * @param {string} userId - User ID
 * @param {string} message - Alert message
 */
async function sendSecurityAlert(userId, message) {
  const notificationData = {
    body: message,
  };

  return await send2FAPushNotification(userId, notificationData);
}

/**
 * Add Push Subscription for User
 * @param {string} userId - User ID
 * @param {Object} subscription - Push subscription object
 * @param {string} userAgent - User agent string
 */
async function addPushSubscription(userId, subscription, userAgent) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return { success: false, error: "User not found" };
    }

    // Initialize push notifications if not exists
    if (!user.twoFactorAuth.pushNotifications) {
      user.twoFactorAuth.pushNotifications = {
        enabled: true,
        subscriptions: [],
      };
    }

    // Check if subscription already exists
    const existingIndex =
      user.twoFactorAuth.pushNotifications.subscriptions.findIndex(
        (sub) => sub.endpoint === subscription.endpoint
      );

    if (existingIndex > -1) {
      // Update existing subscription
      user.twoFactorAuth.pushNotifications.subscriptions[existingIndex] = {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userAgent,
        createdAt: new Date(),
      };
    } else {
      // Add new subscription
      user.twoFactorAuth.pushNotifications.subscriptions.push({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userAgent,
        createdAt: new Date(),
      });
    }

    // Enable push notifications
    user.twoFactorAuth.pushNotifications.enabled = true;

    // Keep only last 5 subscriptions per user
    if (user.twoFactorAuth.pushNotifications.subscriptions.length > 5) {
      user.twoFactorAuth.pushNotifications.subscriptions =
        user.twoFactorAuth.pushNotifications.subscriptions.slice(-5);
    }

    await user.save();

    return { success: true, message: "Push subscription added successfully" };
  } catch (error) {
    console.error("Error adding push subscription:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove Push Subscription
 * @param {string} userId - User ID
 * @param {string} endpoint - Subscription endpoint to remove
 */
async function removePushSubscription(userId, endpoint) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return { success: false, error: "User not found" };
    }

    if (!user.twoFactorAuth.pushNotifications) {
      return { success: false, error: "No push notifications configured" };
    }

    user.twoFactorAuth.pushNotifications.subscriptions =
      user.twoFactorAuth.pushNotifications.subscriptions.filter(
        (sub) => sub.endpoint !== endpoint
      );

    // Disable if no subscriptions left
    if (user.twoFactorAuth.pushNotifications.subscriptions.length === 0) {
      user.twoFactorAuth.pushNotifications.enabled = false;
    }

    await user.save();

    return { success: true, message: "Push subscription removed successfully" };
  } catch (error) {
    console.error("Error removing push subscription:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get VAPID Public Key
 */
function getVapidPublicKey() {
  return vapidKeys.publicKey;
}

/**
 * Test Push Notification
 * @param {string} userId - User ID
 */
async function testPushNotification(userId) {
  const notificationData = {
    body: "This is a test notification from GUARDIAN 3PL Platform. Push notifications are working correctly!",
  };

  return await send2FAPushNotification(userId, notificationData);
}

module.exports = {
  send2FAPushNotification,
  send2FAApprovalRequest,
  sendSecurityAlert,
  addPushSubscription,
  removePushSubscription,
  getVapidPublicKey,
  testPushNotification,
};
