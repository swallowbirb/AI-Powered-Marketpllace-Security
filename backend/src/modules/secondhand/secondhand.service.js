// TODO: implement sell-used intake flow

const createDraft = async (userId, data) => {
  // TODO: create SecondhandItem with status 'draft'
};

const submitItem = async (itemId, userId) => {
  // TODO: validate photos present, transition to 'submitted', trigger grading pipeline
};

const getItemById = async (itemId) => {
  // TODO: fetch SecondhandItem with populated fields
};

const getItemsByUser = async (userId) => {
  // TODO: fetch all secondhand items for user
};

module.exports = { createDraft, submitItem, getItemById, getItemsByUser };
