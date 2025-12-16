const express = require('express');
const router = express.Router();

module.exports = (mollie, dbUtils, broadcastPayment, sendConfirmationEmail) => {
  const { insertPayment, updatePaymentEmail, getRecentPayments } = dbUtils;

  // Fixed allowed donation amounts
  const ALLOWED_AMOUNTS = [1, 2, 5, 10];

  // ---------------------- CREATE PAYMENT ----------------------
  router.post('/create-payment', async (req, res) => {
    try {
      const name = (req.body.name || '').trim();
      const amount = Number(req.body.amount);
      const message = (req.body.message || 'Donatie').trim();

      if (!name) {
        return res.status(400).json({ error: 'Naam is verplicht' });
      }

      if (!ALLOWED_AMOUNTS.includes(amount)) {
        return res.status(400).json({ error: 'Ongeldig bedrag geselecteerd' });
      }

      const payment = await mollie.payments.create({
        amount: {
          currency: 'EUR',
          value: amount.toFixed(2) // "1.00", "2.00", "5.00", "10.00"
        },
        description: message,
        redirectUrl: `${process.env.BASE_URL}/payment-status?id=temp`,
        webhookUrl: `${process.env.BASE_URL}/mollie-webhook`,
        metadata: {
          donorName: name,
          message,
          fixedAmount: amount
        }
      });

      // Update redirect URL with real payment ID
      await mollie.payments.update(payment.id, {
        redirectUrl: `${process.env.BASE_URL}/payment-status?id=${payment.id}`
      }).catch(() => {});

      res.json({
        checkoutUrl: payment._links.checkout.href,
        id: payment.id,
        amount
      });
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

    if (!id || !email) {
      return res.status(400).json({ error: 'Missing data' });
    }

    try {
      updatePaymentEmail(id, email);

      const payment = dbUtils.db
        .prepare('SELECT * FROM payments WHERE id = ?')
        .get(id);

      if (payment) {
        await sendConfirmationEmail(email, payment);
      }

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
      if (mock) {
        status = mock;
      } else {
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
<title>Bedankt! 🎉</title>
</head>
<body style="background:#050505;color:#fff;font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
  <div style="max-width:420px;text-align:center">
    <h1 style="color:#9D1313">Bedankt! 🎉</h1>
    <p>Je betaling is succesvol ontvangen.</p>

    <form id="emailForm">
      <input type="email" id="email" placeholder="jouw@email.com" required />
      <button type="submit">Stuur bevestiging</button>
    </form>

    <p id="statusText"></p>

    <p><a href="/">← Terug naar home</a></p>
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
    if (data.success) {
      statusText.textContent = '✅ E-mail verzonden!';
    } else {
      throw new Error(data.error);
    }
  } catch (err) {
    statusText.textContent = '❌ Fout bij verzenden';
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
