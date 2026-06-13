const trustService = require('./trust.service');

const getTrustProfile = async (req, res, next) => {
  try {
    res.status(501).json({ success: false, message: 'Not implemented' });
  } catch (error) {
    next(error);
  }
};

const recomputeTrust = async (req, res, next) => {
  try {
    res.status(501).json({ success: false, message: 'Not implemented' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getTrustProfile, recomputeTrust };
