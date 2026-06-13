const express = require('express');
const router = express.Router();
const returnController = require('./return.controller');
const { validateInitiateReturn, validateSubmitEvidence } = require('./return.validation');

router.get('/health', (req, res) => {
  res.status(200).json({ module: 'returns', status: 'scaffolded' });
});

// TODO: add requireAuth, attachUser middleware when implementing
router.post('/', validateInitiateReturn, returnController.initiateReturn);
router.post('/:id/evidence', validateSubmitEvidence, returnController.submitEvidence);
router.get('/:id', returnController.getReturn);

module.exports = router;
