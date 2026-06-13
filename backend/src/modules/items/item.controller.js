const itemService = require('./item.service');
const { getEventsByItemId } = require('../lifecycle/lifecycle.service');

const getItem = async (req, res, next) => {
  try {
    const item = await itemService.getItemById(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    // Only owner or admin can read
    if (
      item.initiatorUserId.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const events = await getEventsByItemId(req.params.itemId);
    res.status(200).json({ success: true, data: { ...item, lifecycleEvents: events } });
  } catch (err) {
    next(err);
  }
};

const getMyItems = async (req, res, next) => {
  try {
    const items = await itemService.getItemsByUser(req.user._id);
    res.status(200).json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
};

module.exports = { getItem, getMyItems };
