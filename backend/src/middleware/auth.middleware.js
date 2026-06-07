const { ClerkExpressRequireAuth } = require("@clerk/clerk-sdk-node");
const User = require("../modules/users/user.model");

// Basic Clerk authentication middleware
// Validates token and populates req.auth
const requireAuth = ClerkExpressRequireAuth({
  // Optionally, you can add behavior for unauthorized requests
});

// Middleware to attach our DB user to the request
const attachUser = async (req, res, next) => {
  try {
    if (!req.auth || !req.auth.userId) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized from attached user!" });
    }

    const user = await User.findOne({ clerkId: req.auth.userId }).lean();

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "User not synced in database" });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

// Role-based authorization middleware
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized from requireRole" });
    }

    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Forbidden: Insufficient permissions",
        });
    }

    next();
  };
};

module.exports = {
  requireAuth,
  attachUser,
  requireRole,
};
