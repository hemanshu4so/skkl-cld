// functions/qrInventory/index.js — barrel for the QR-inventory functions.
// In your functions root index.js add:  module.exports = { ...require('./qrInventory') };
module.exports = {
  ...require('./allocateItemId'),
  ...require('./onMovementCreate'),
  ...require('./onRepairWrite'),
  ...require('./onSaleFinalize'),
};
