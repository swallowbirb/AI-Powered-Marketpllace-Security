const express = require('express');
const router = express.Router();
const gradingController = require('./grading.controller');
const { validateTriggerGrading } = require('./grading.validation');
const { requireAuth, attachUser, requireRole } = require('../../middleware/auth.middleware');

// Health — ML service reachability (Req 14.5).
router.get('/health', gradingController.health);

// Trigger grading (REST entry point for standalone testing / future use).
router.post('/trigger', validateTriggerGrading, gradingController.triggerGrading);

// Progressive form rendering (Task 2.11).
router.post('/form/:itemId', gradingController.startForm);
router.get('/form/:itemId', gradingController.getForm);

// Per-photo validation proxy (v3.44) — inline "right part? in focus?" feedback.
router.post('/validate-photo', gradingController.validatePhoto);

// Flagged grades for the seller/admin dashboard (Req 9.4 / 9.5).
router.get(
  '/flagged',
  requireAuth,
  attachUser,
  requireRole(['seller', 'admin']),
  gradingController.getFlaggedGrades
);

// Get a grade by itemId — keep last so it doesn't shadow the static routes above.
router.get('/:itemId', gradingController.getGrade);

module.exports = router;
