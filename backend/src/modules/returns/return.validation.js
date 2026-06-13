// TODO: Add Joi/express-validator schemas for return initiation and evidence submission

const validateInitiateReturn = (req, res, next) => {
  // TODO: validate orderId, reason, claimDescription
  next();
};

const validateSubmitEvidence = (req, res, next) => {
  // TODO: validate evidencePhotos array (S3 URLs)
  next();
};

module.exports = { validateInitiateReturn, validateSubmitEvidence };
