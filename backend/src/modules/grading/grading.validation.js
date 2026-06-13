// TODO: Add validation schemas for grading trigger

const validateTriggerGrading = (req, res, next) => {
  // TODO: validate itemId, photos array (S3 URLs)
  next();
};

module.exports = { validateTriggerGrading };
