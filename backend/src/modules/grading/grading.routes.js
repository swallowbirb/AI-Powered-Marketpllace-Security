const express = require('express');
const router = express.Router();
const gradingController = require('./grading.controller');
const { validateTriggerGrading } = require('./grading.validation');

router.get('/health', (req, res) => {
  res.status(200).json({ module: 'grading', status: 'scaffolded' });
});

// TODO: add requireAuth, attachUser middleware when implementing
router.post('/trigger', validateTriggerGrading, gradingController.triggerGrading);
router.get('/:itemId', gradingController.getGrade);

module.exports = router;
