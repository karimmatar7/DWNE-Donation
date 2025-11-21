const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../payments.db'));

db.prepare(`
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    status TEXT,
    name TEXT,
    message TEXT,
    method TEXT,
    amount TEXT,
    currency TEXT,
    createdAt TEXT,
    updatedAt TEXT,
    email TEXT
  )
`).run();

function insertPayment(p) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO payments (id, status, name, message, method, amount, currency, createdAt, updatedAt, email)
    VALUES (@id, @status, @name, @message, @method, @amount, @currency, @createdAt, @updatedAt, @email)
  `);
  stmt.run(p);
}

function updatePaymentEmail(id, email) {
  db.prepare(`UPDATE payments SET email = ? WHERE id = ?`).run(email, id);
}

function getRecentPayments(limit = 10) {
  return db.prepare(`SELECT * FROM payments ORDER BY datetime(createdAt) DESC LIMIT ?`).all(limit);
}

module.exports = { db, insertPayment, updatePaymentEmail, getRecentPayments };
