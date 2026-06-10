const validateCreateProduct = (req, res, next) => {
  const { title, description, price, category, images, brandName, condition } = req.body;
  const errors = [];

  if (!title || typeof title !== 'string' || title.trim() === '') {
    errors.push('Title is required and must be a string');
  }

  if (!description || typeof description !== 'string' || description.trim() === '') {
    errors.push('Description is required and must be a string');
  }

  if (price === undefined || typeof price !== 'number' || price < 0) {
    errors.push('Price is required and must be a positive number');
  }

  if (!category || typeof category !== 'string' || category.trim() === '') {
    errors.push('Category is required and must be a string');
  }

  // Optional: images must be an array of strings if provided
  if (images !== undefined) {
    if (!Array.isArray(images)) {
      errors.push('images must be an array of URLs');
    } else if (images.some((url) => typeof url !== 'string')) {
      errors.push('Each image must be a URL string');
    }
  }

  // Optional: brandName must be a string if provided (free-text honeypot field)
  if (brandName !== undefined && (typeof brandName !== 'string' || brandName.trim() === '')) {
    errors.push('brandName must be a non-empty string');
  }

  // Optional: condition must be 'New' or 'Used' if provided
  if (condition !== undefined && !['New', 'Used'].includes(condition)) {
    errors.push("condition must be either 'New' or 'Used'");
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  next();
};

const validateUpdateProduct = (req, res, next) => {
  const { title, description, price, category, images, brandName, condition } = req.body;
  const errors = [];

  if (title !== undefined && (typeof title !== 'string' || title.trim() === '')) {
    errors.push('Title must be a non-empty string');
  }

  if (description !== undefined && (typeof description !== 'string' || description.trim() === '')) {
    errors.push('Description must be a non-empty string');
  }

  if (price !== undefined && (typeof price !== 'number' || price < 0)) {
    errors.push('Price must be a positive number');
  }

  if (category !== undefined && (typeof category !== 'string' || category.trim() === '')) {
    errors.push('Category must be a non-empty string');
  }

  if (images !== undefined) {
    if (!Array.isArray(images)) {
      errors.push('images must be an array of URLs');
    } else if (images.some((url) => typeof url !== 'string')) {
      errors.push('Each image must be a URL string');
    }
  }

  if (brandName !== undefined && (typeof brandName !== 'string' || brandName.trim() === '')) {
    errors.push('brandName must be a non-empty string');
  }

  if (condition !== undefined && !['New', 'Used'].includes(condition)) {
    errors.push("condition must be either 'New' or 'Used'");
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  next();
};

module.exports = {
  validateCreateProduct,
  validateUpdateProduct,
};
