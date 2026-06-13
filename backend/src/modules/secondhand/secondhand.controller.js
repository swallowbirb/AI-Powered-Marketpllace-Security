const secondhandService = require('./secondhand.service');

const createDraft = async (req, res, next) => {
  try {
    res.status(501).json({ success: false, message: 'Not implemented' });
  } catch (error) {
    next(error);
  }
};

const submitItem = async (req, res, next) => {
  try {
    res.status(501).json({ success: false, message: 'Not implemented' });
  } catch (error) {
    next(error);
  }
};

const getItem = async (req, res, next) => {
  try {
    res.status(501).json({ success: false, message: 'Not implemented' });
  } catch (error) {
    next(error);
  }
};

module.exports = { createDraft, submitItem, getItem };
