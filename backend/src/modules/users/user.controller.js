const userService = require('./user.service');

const syncUser = async (req, res, next) => {
  try {
    const { id: clerkId, email_addresses, first_name, last_name, image_url } = req.auth.user;
    
    // Fallback if not using req.auth.user (if we get it from body instead)
    // However, Clerk SDK normally populates req.auth.
    // If it's a webhook or frontend passing data, we'll validate.
    
    const email = email_addresses && email_addresses.length > 0 ? email_addresses[0].email_address : req.body.email;
    const userData = {
      clerkId: clerkId || req.body.clerkId,
      email: email,
      firstName: first_name || req.body.firstName,
      lastName: last_name || req.body.lastName,
      avatarUrl: image_url || req.body.avatarUrl,
    };

    if (!userData.clerkId || !userData.email) {
      return res.status(400).json({ success: false, message: 'Missing required user data' });
    }

    const user = await userService.syncUser(userData);

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    // The attachUser middleware ensures our DB user is attached to req.user
    res.status(200).json({
      success: true,
      data: req.user,
    });
  } catch (error) {
    next(error);
  }
};

const updateRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    
    if (!['buyer', 'seller', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const user = req.user;
    
    // Using user model to update role
    const User = require('./user.model');
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { role },
      { new: true }
    ).lean();

    res.status(200).json({
      success: true,
      data: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  syncUser,
  getMe,
  updateRole,
};
