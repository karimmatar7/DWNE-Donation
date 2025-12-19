const { Locale } = require('@mollie/api-client');
const express = require('express');
const router = express.Router();

module.exports = (mollie, dbUtils, broadcastPayment, sendConfirmationEmail) => {
  const { insertPayment, updatePaymentEmail, getRecentPayments } = dbUtils;

  const ALLOWED_AMOUNTS = [1, 2, 5, 10];

  // ---------------------- CREATE PAYMENT ----------------------
  router.post('/create-payment', async (req, res) => {
    try {
      const name = (req.body.name || '').trim();
      const amount = Number(req.body.amount);
      const message = (req.body.message || 'Donatie').trim();

      if (!name) return res.status(400).json({ error: 'Naam is verplicht' });
      if (!ALLOWED_AMOUNTS.includes(amount)) return res.status(400).json({ error: 'Ongeldig bedrag geselecteerd' });

const payment = await mollie.payments.create({
  amount: {
    currency: 'EUR',
    value: amount.toFixed(2)
  },
  description: message,
  redirectUrl: `${process.env.BASE_URL}/payment-status?id=temp`,
  webhookUrl: `${process.env.BASE_URL}/mollie-webhook`,
  locale: 'nl_NL', // ✅ lowercase
  metadata: {
    donorName: name,
    message,
    fixedAmount: amount
  }
});


      await mollie.payments.update(payment.id, {
        redirectUrl: `${process.env.BASE_URL}/payment-status?id=${payment.id}`
      }).catch(() => {});

      res.json({ checkoutUrl: payment._links.checkout.href, id: payment.id, amount });
    } catch (err) {
      console.error('❌ Error /create-payment:', err);
      res.status(500).json({ error: 'Kon betaling niet aanmaken' });
    }
  });

  // ---------------------- MOLLIE WEBHOOK ----------------------
  router.post('/mollie-webhook', express.urlencoded({ extended: true }), async (req, res) => {
    if (!req.body.id) return res.status(400).end();

    try {
      const payment = await mollie.payments.get(req.body.id);

      if (payment.status === 'paid') {
        const record = {
          id: payment.id,
          status: payment.status,
          name: payment.metadata?.donorName || '(onbekend)',
          message: payment.metadata?.message || '',
          method: payment.method || '',
          amount: payment.amount?.value || '0.00',
          currency: payment.amount?.currency || 'EUR',
          createdAt: payment.createdAt,
          updatedAt: payment.paidAt,
          email: ''
        };

        insertPayment(record);
        broadcastPayment(record);
      }

      res.status(200).end();
    } catch (err) {
      console.error('❌ Webhook error:', err);
      res.status(500).end();
    }
  });

  // ---------------------- EMAIL SUBMISSION ----------------------
  router.post('/submit-email', async (req, res) => {
    const { id, email } = req.body;
    if (!id || !email) return res.status(400).json({ error: 'Missing data' });

    try {
      updatePaymentEmail(id, email);

      const payment = dbUtils.db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
      if (payment) await sendConfirmationEmail(email, payment);

      res.json({ success: true });
    } catch (err) {
      console.error('❌ Email error:', err);
      res.status(500).json({ error: 'Kon e-mail niet verzenden' });
    }
  });

  // ---------------------- PAYMENT STATUS ----------------------
  router.get('/payment-status', async (req, res) => {
    const id = req.query.id;
    const mock = req.query.mock;

    if (!id) return res.redirect('/?error=invalid-id');

    let status;
    try {
      if (mock) status = mock;
      else {
        const payment = await mollie.payments.get(id);
        status = payment.status;
      }
    } catch (err) {
      console.error('❌ payment-status error:', err);
      return res.redirect('/?error=fetch-failed');
    }

    if (status !== 'paid') {
      return res.redirect(`/?error=${status}`);
    }

    // Success page
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Bedankt!</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
:root {
  --bg:#050505; --card:#0d0d0d; --accent:#9D1313; --accent-hover:#b81616;
  --text:#D9D9D9; --muted:#a3a3a3; --border:rgba(217,217,217,0.08);
}
* { box-sizing:border-box; }
body { font-family:'Inter',system-ui,sans-serif; margin:0; background:radial-gradient(circle at 25% 25%,#0a0a0a,#050505); color:var(--text); display:flex; align-items:center; justify-content:center; min-height:100vh; padding:24px; }
.card { background:var(--card); padding:40px; border-radius:18px; border:1px solid var(--border); box-shadow:0 6px 30px rgba(0,0,0,0.5); width:100%; max-width:420px; animation:fadeIn .8s ease forwards; text-align:center; }
h1 { margin:0 0 16px; font-size:2rem; font-weight:700; color:var(--accent); text-shadow:0 0 15px rgba(157,19,19,0.3); }
p { font-size:.95rem; color:var(--muted); margin-bottom:20px; }
form { display:grid; gap:14px; margin-top:10px; }
input[type="email"] { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); color:var(--text); border-radius:10px; padding:12px 14px; font-size:1rem; outline:none; }
input[type="email"]:focus { border-color:var(--accent); background:rgba(157,19,19,0.15); }
button { background:linear-gradient(135deg,var(--accent),var(--accent-hover)); color:#fff; border:none; padding:14px; border-radius:10px; cursor:pointer; font-size:1rem; font-weight:700; box-shadow:0 0 18px rgba(157,19,19,0.35); transition:.2s; }
button:hover { transform:translateY(-1px); }
#statusText { margin-top:10px; font-size:.9rem; }
a { display:inline-block; margin-top:18px; color:var(--accent-hover); text-decoration:none; font-weight:600; }
a:hover { text-decoration:underline; }
@keyframes fadeIn { from { opacity:0; transform:translateY(15px); } to { opacity:1; transform:translateY(0); } }
</style>
</head>
<body>
<div class="card">
<h1>Bedankt!</h1>
<p>Je betaling is succesvol ontvangen.</p>
<form id="emailForm">
<input type="email" id="email" placeholder="jouw@email.com" required />
<button type="submit">Stuur bevestiging</button>
</form>
<p id="statusText"></p>
<a href="/">← Terug naar home</a>
</div>
<script>
const form = document.getElementById('emailForm');
const statusText = document.getElementById('statusText');
form.addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  try {
    const res = await fetch('/submit-email', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ id: '${id}', email })
    });
    const data = await res.json();
    statusText.textContent = data.success ? '✅ Bevestiging is verzonden!' : '❌ Kon e-mail niet verzenden';
  } catch {
    statusText.textContent = '❌ Netwerkfout';
  }
});
</script>
</body>
</html>`);
  });

  // ---------------------- RECENT PAYMENTS ----------------------
  router.get('/payments/recent', (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    const items = getRecentPayments(limit);

    res.json({
      mode: process.env.MOLLIE_API_KEY.startsWith('test_') ? 'test' : 'live',
      count: items.length,
      items
    });
  });

  return router;
};
