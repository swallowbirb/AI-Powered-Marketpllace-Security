// TODO: Add validation schemas for secondhand item creation and submission

const validateCreateDraft = (req, res, next) => {
  // TODO: validate category, optional title/description
  next();
};

const validateSubmitItem = (req, res, next) => {
  // TODO: validate photos array has at least 1 image
  next();
};

module.exports = { validateCreateDraft, validateSubmitItem };
