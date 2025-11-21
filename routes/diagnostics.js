const express = require('express');

module.exports = (BASE_URL, MOLLIE_KEY, db) => {
  const router = express.Router();

  router.get('/whoami', (req, res) => {
    res.json({
      baseUrl: BASE_URL,
      keyMode: MOLLIE_KEY.startsWith('test_') ? 'test' : 'live',
      dbRows: db.prepare('SELECT COUNT(*) AS c FROM payments').get().c,
    });
  });

  return router;
};
