const gradingService = require('./grading.service');

const triggerGrading = async (req, res, next) => {
  try {
    res.status(501).json({ success: false, message: 'Not implemented' });
  } catch (error) {
    next(error);
  }
};

const getGrade = async (req, res, next) => {
  try {
    res.status(501).json({ success: false, message: 'Not implemented' });
  } catch (error) {
    next(error);
  }
};

module.exports = { triggerGrading, getGrade };
