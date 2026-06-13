// TODO: implement return initiation & state machine

const initiateReturn = async (data) => {
  // TODO: validate order belongs to user, create Return doc, emit INITIATED lifecycle event
};

const submitEvidence = async (returnId, userId, photos) => {
  // TODO: update Return status to evidence_submitted, attach S3 URLs, trigger grading pipeline
};

const getReturnById = async (returnId) => {
  // TODO: fetch Return with populated fields
};

const getReturnsByUser = async (userId) => {
  // TODO: fetch all returns for user
};

const updateReturnStatus = async (returnId, status, data = {}) => {
  // TODO: transition state machine, validate allowed transitions
};

module.exports = {
  initiateReturn,
  submitEvidence,
  getReturnById,
  getReturnsByUser,
  updateReturnStatus,
};
