const express = require('express');
const router = express.Router();
const secondhandController = require('./secondhand.controller');
const { validateCreateDraft, validateSubmitItem } = require('./secondhand.validation');

router.get('/health', (req, res) => {
  res.status(200).json({ module: 'secondhand', status: 'scaffolded' });
});

// TODO: add requireAuth, attachUser middleware when implementing
router.post('/draft', validateCreateDraft, secondhandController.createDraft);
router.post('/:id/submit', validateSubmitItem, secondhandController.submitItem);
router.get('/:id', secondhandController.getItem);

module.exports = router;
