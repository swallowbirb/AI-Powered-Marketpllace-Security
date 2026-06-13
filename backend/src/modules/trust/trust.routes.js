const express = require('express');
const router = express.Router();
const trustController = require('./trust.controller');

router.get('/health', (req, res) => {
  res.status(200).json({ module: 'trust', status: 'scaffolded' });
});

router.get('/:userId', trustController.getTrustProfile);
router.post('/:userId/recompute', trustController.recomputeTrust);

module.exports = router;
