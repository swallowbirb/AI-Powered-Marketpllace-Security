const returnService = require('./return.service');

const initiateReturn = async (req, res, next) => {
  try {
    // TODO: implement
    res.status(501).json({ success: false, message: 'Not implemented' });
  } catch (error) {
    next(error);
  }
};

const submitEvidence = async (req, res, next) => {
  try {
    // TODO: implement
    res.status(501).json({ success: false, message: 'Not implemented' });
  } catch (error) {
    next(error);
  }
};

const getReturn = async (req, res, next) => {
  try {
    // TODO: implement
    res.status(501).json({ success: false, message: 'Not implemented' });
  } catch (error) {
    next(error);
  }
};

module.exports = { initiateReturn, submitEvidence, getReturn };
