// TODO: implement AI grading pipeline orchestration

const triggerGrading = async (itemId, photos, context = {}) => {
  // TODO:
  // 1. Call ml-service /grade endpoint with photos
  // 2. Run Rekognition label detection on each photo
  // 3. Aggregate pass1 (vision) + pass2 (LLM) results
  // 4. Save Grade document
  // 5. Emit GRADED lifecycle event
};

const getGradeByItemId = async (itemId) => {
  // TODO: fetch Grade document by itemId
};

const getGradeById = async (gradeId) => {
  // TODO: fetch Grade document by gradeId
};

module.exports = { triggerGrading, getGradeByItemId, getGradeById };
