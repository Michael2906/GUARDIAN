const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const crypto = require("crypto");
const { User } = require("../models");

/**
 * Two-Factor Authentication Controller
 *
 * Handles TOTP setup, verification, backup codes, and recovery
 */

/**
 * Generate 2FA Setup (Secret and QR Code)
 * GET /api/auth/2fa/setup
 */
const generate2FASetup = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Check if 2FA is already enabled
    if (user.twoFactorAuth.enabled) {
      return res.status(400).json({
        success: false,
        error: "2FA is already enabled. Disable it first to regenerate.",
      });
    }

    // Generate a secret for the user
    const secret = speakeasy.generateSecret({
      name: `${user.email}`,
      issuer: "GUARDIAN 3PL Platform",
      length: 32,
    });

    // Store the temporary secret (not enabled yet)
    user.twoFactorAuth.secret = secret.base32;
    await user.save();

    // Generate QR Code URL
    const qrCodeUrl = speakeasy.otpauthURL({
      secret: secret.ascii,
      label: `${user.email}`,
      issuer: "GUARDIAN 3PL Platform",
      encoding: "ascii",
    });

    // Generate QR Code as data URL
    const qrCodeDataURL = await QRCode.toDataURL(qrCodeUrl);

    res.json({
      success: true,
      message: "Setup 2FA by scanning the QR code with Google Authenticator",
      data: {
        secret: secret.base32,
        qrCode: qrCodeDataURL,
        manualEntryKey: secret.base32,
        instructions: [
          "1. Open Google Authenticator on your mobile device",
          "2. Tap the + icon to add a new account",
          '3. Choose "Scan QR code" and scan the code below',
          "4. Enter the 6-digit code from your app to verify setup",
        ],
      },
    });
  } catch (error) {
    console.error("2FA setup generation error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate 2FA setup",
    });
  }
};

/**
 * Verify and Enable 2FA
 * POST /api/auth/2fa/verify-setup
 * Body: { token }
 */
const verifyAndEnable2FA = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.userId;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: "6-digit verification token is required",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    if (!user.twoFactorAuth.secret) {
      return res.status(400).json({
        success: false,
        error: "No 2FA setup found. Generate setup first.",
      });
    }

    if (user.twoFactorAuth.enabled) {
      return res.status(400).json({
        success: false,
        error: "2FA is already enabled",
      });
    }

    // Verify the token
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorAuth.secret,
      encoding: "base32",
      token: token,
      window: 2, // Allow 2 time steps (60 seconds) of tolerance
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        error: "Invalid verification code. Please try again.",
      });
    }

    // Generate backup codes
    const backupCodes = generateBackupCodes();

    // Enable 2FA
    user.twoFactorAuth.enabled = true;
    user.twoFactorAuth.backupCodes = backupCodes.map((code) =>
      crypto.createHash("sha256").update(code).digest("hex")
    );
    user.twoFactorAuth.lastUsedAt = new Date();

    // Clear all existing refresh tokens (force re-login everywhere)
    user.refreshTokens = [];

    await user.save();

    res.json({
      success: true,
      message: "2FA has been successfully enabled",
      data: {
        backupCodes: backupCodes, // Show plaintext codes only once
        message:
          "Save these backup codes in a secure location. You will not see them again.",
        enabled: true,
      },
    });
  } catch (error) {
    console.error("2FA verification error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to verify and enable 2FA",
    });
  }
};

/**
 * Disable 2FA
 * POST /api/auth/2fa/disable
 * Body: { password, token? }
 */
const disable2FA = async (req, res) => {
  try {
    const { password, token } = req.body;
    const userId = req.user.userId;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: "Current password is required to disable 2FA",
      });
    }

    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        error: "Invalid password",
      });
    }

    if (!user.twoFactorAuth.enabled) {
      return res.status(400).json({
        success: false,
        error: "2FA is not enabled",
      });
    }

    // If 2FA is enabled, require TOTP token for additional security
    if (token) {
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorAuth.secret,
        encoding: "base32",
        token: token,
        window: 2,
      });

      if (!verified) {
        return res.status(400).json({
          success: false,
          error: "Invalid 2FA code",
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        error: "2FA verification code is required",
      });
    }

    // Disable 2FA
    user.twoFactorAuth = {
      enabled: false,
      secret: null,
      backupCodes: [],
      lastUsedAt: null,
    };

    // Clear all refresh tokens (force re-login)
    user.refreshTokens = [];

    await user.save();

    res.json({
      success: true,
      message: "2FA has been disabled successfully",
    });
  } catch (error) {
    console.error("2FA disable error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to disable 2FA",
    });
  }
};

/**
 * Verify 2FA Token (used during login)
 * POST /api/auth/2fa/verify
 * Body: { userId, token }
 */
const verify2FAToken = async (req, res) => {
  try {
    const { userId, token } = req.body;

    if (!userId || !token) {
      return res.status(400).json({
        success: false,
        error: "User ID and 6-digit token are required",
      });
    }

    const user = await User.findById(userId);
    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        error: "User not found or inactive",
      });
    }

    if (!user.twoFactorAuth.enabled) {
      return res.status(400).json({
        success: false,
        error: "2FA is not enabled for this user",
      });
    }

    // Try TOTP verification first
    let verified = speakeasy.totp.verify({
      secret: user.twoFactorAuth.secret,
      encoding: "base32",
      token: token,
      window: 2,
    });

    let usedBackupCode = false;

    // If TOTP fails, try backup codes
    if (!verified && user.twoFactorAuth.backupCodes.length > 0) {
      const hashedToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
      const backupCodeIndex =
        user.twoFactorAuth.backupCodes.indexOf(hashedToken);

      if (backupCodeIndex !== -1) {
        // Remove used backup code
        user.twoFactorAuth.backupCodes.splice(backupCodeIndex, 1);
        verified = true;
        usedBackupCode = true;

        await user.save();
      }
    }

    if (!verified) {
      return res.status(400).json({
        success: false,
        error: "Invalid 2FA code or backup code",
      });
    }

    // Update last used timestamp
    user.twoFactorAuth.lastUsedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: "2FA verification successful",
      data: {
        verified: true,
        usedBackupCode,
        remainingBackupCodes: user.twoFactorAuth.backupCodes.length,
      },
    });
  } catch (error) {
    console.error("2FA verification error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to verify 2FA token",
    });
  }
};

/**
 * Get 2FA Status
 * GET /api/auth/2fa/status
 */
const get2FAStatus = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId).select(
      "twoFactorAuth.enabled twoFactorAuth.lastUsedAt twoFactorAuth.backupCodes"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.json({
      success: true,
      data: {
        enabled: user.twoFactorAuth.enabled || false,
        lastUsedAt: user.twoFactorAuth.lastUsedAt,
        backupCodesRemaining: user.twoFactorAuth.backupCodes
          ? user.twoFactorAuth.backupCodes.length
          : 0,
        canSetup: !user.twoFactorAuth.enabled,
      },
    });
  } catch (error) {
    console.error("Get 2FA status error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get 2FA status",
    });
  }
};

/**
 * Regenerate Backup Codes
 * POST /api/auth/2fa/regenerate-backup-codes
 * Body: { password }
 */
const regenerateBackupCodes = async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.user.userId;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: "Current password is required",
      });
    }

    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        error: "Invalid password",
      });
    }

    if (!user.twoFactorAuth.enabled) {
      return res.status(400).json({
        success: false,
        error: "2FA must be enabled to regenerate backup codes",
      });
    }

    // Generate new backup codes
    const backupCodes = generateBackupCodes();
    user.twoFactorAuth.backupCodes = backupCodes.map((code) =>
      crypto.createHash("sha256").update(code).digest("hex")
    );

    await user.save();

    res.json({
      success: true,
      message: "Backup codes regenerated successfully",
      data: {
        backupCodes: backupCodes, // Show plaintext codes only once
        message:
          "Save these new backup codes in a secure location. Old backup codes are no longer valid.",
      },
    });
  } catch (error) {
    console.error("Regenerate backup codes error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to regenerate backup codes",
    });
  }
};

/**
 * Helper function to generate backup codes
 */
function generateBackupCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric codes
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    codes.push(code);
  }
  return codes;
}

module.exports = {
  generate2FASetup,
  verifyAndEnable2FA,
  disable2FA,
  verify2FAToken,
  get2FAStatus,
  regenerateBackupCodes,
};
