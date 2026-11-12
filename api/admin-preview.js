'use strict';

// Retired legacy preview endpoint. The authenticated UI now lives at /api/admin-ui.
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(404).end();
};
