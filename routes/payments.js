const express = require('express');
const router = express.Router();

module.exports = (mollie, dbUtils, broadcastPayment, sendConfirmationEmail) => {
  const { insertPayment, updatePaymentEmail, getRecentPayments } = dbUtils;

  // ---------------------- CREATE PAYMENT ----------------------
  router.post('/create-payment', async (req, res) => {
    try {
      const name = (req.body.name || '').trim();
      const amount = parseFloat(req.body.amount);
      const message = (req.body.message || 'Donatie').trim();

      if (!name) return res.status(400).json({ error: 'Naam is verplicht' });
      if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Ongeldig bedrag' });

      const payment = await mollie.payments.create({
        amount: { currency: 'EUR', value: amount.toFixed(2) },
        description: message,
        redirectUrl: `${process.env.BASE_URL}/payment-status?id=temp`,
        webhookUrl: `${process.env.BASE_URL}/mollie-webhook`,
        metadata: { donorName: name, message }
      });

      await mollie.payments.update(payment.id, { redirectUrl: `${process.env.BASE_URL}/payment-status?id=${payment.id}` }).catch(() => {});
      res.json({ checkoutUrl: payment._links.checkout.href, id: payment.id });
    } catch (err) {
      console.error('❌ Error /create-payment:', err);
      res.status(500).json({ error: 'Kon betaling niet aanmaken' });
    }
  });

  // ---------------------- WEBHOOK ----------------------
  router.post('/mollie-webhook', express.urlencoded({ extended: true }), async (req, res) => {
    if (!req.body.id) return res.status(400).end();
    try {
      const payment = await mollie.payments.get(req.body.id);
      if (payment.status === 'paid') {
        const record = {
          id: payment.id,
          status: payment.status,
          name: payment.metadata?.donorName || '(onbekend)',
          message: payment.metadata?.message || payment.description || '',
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
    if (mock) status = mock;
    else {
      try {
        const payment = await mollie.payments.get(id);
        status = payment.status;
      } catch (err) {
        console.error('❌ payment-status error:', err);
        return res.redirect('/?error=fetch-failed');
      }
    }

    // Redirect to home if canceled or failed
    if (status !== 'paid') return res.redirect(`/?error=${status}`);

    // Paid → show success page
    res.setHeader('Content-Type', 'text/html');
    res.send(`
<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Bedankt! 🎉</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
:root{--bg:#050505;--card:#0d0d0d;--accent:#9D1313;--accent-hover:#b81616;--text:#D9D9D9;--muted:#a3a3a3;--border:rgba(217,217,217,0.08);}
*{box-sizing:border-box} body{font-family:'Inter',system-ui,sans-serif;margin:0;background:radial-gradient(circle at 25% 25%,#0a0a0a,#050505);color:var(--text);display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;}
.card{background:var(--card);padding:40px;border-radius:18px;border:1px solid var(--border);box-shadow:0 6px 30px rgba(0,0,0,0.5);width:100%;max-width:420px;animation:fadeIn .8s ease forwards;}
h1{text-align:center;color:var(--accent);margin:0 0 16px;font-size:2rem;font-weight:700;text-shadow:0 0 15px rgba(157,19,19,0.3);}
p{text-align:center;color:var(--muted);margin:0 0 24px;font-size:1rem;}
.email-section{margin-top:28px;padding-top:24px;border-top:1px solid var(--border);}
form{display:grid;gap:12px;}
input{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:var(--text);border-radius:10px;padding:10px 12px;font-size:1rem;outline:none;}
input:focus{border-color:var(--accent);background:rgba(157,19,19,0.15);}
button{background:linear-gradient(135deg,var(--accent),var(--accent-hover));color:#fff;border:none;padding:12px 18px;border-radius:10px;cursor:pointer;font-size:1rem;font-weight:600;box-shadow:0 0 18px rgba(157,19,19,0.35);transition:.2s;}
button:hover{transform:scale(1.04);box-shadow:0 0 25px rgba(157,19,19,0.55);background:linear-gradient(135deg,var(--accent-hover),#c81e1e);}
.links{margin-top:28px;padding-top:24px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:12px;}
a{text-align:center;color:var(--accent-hover);text-decoration:none;font-weight:600;font-size:.9rem;transition:.2s;}
a:hover{color:#c81e1e;text-decoration:underline;}
#statusText{text-align:center;font-size:.9rem;margin-top:12px;min-height:24px;}
#statusText.success{color:#10b981} #statusText.error{color:#f87171}
@keyframes fadeIn{from{opacity:0;transform:translateY(15px);}to{opacity:1;transform:translateY(0);}}
</style>
</head>
<body>
<div class="card">
<h1>Bedankt! 🎉</h1>
<p>Je betaling is succesvol ontvangen.</p>

<div class="email-section">
<p>Wil je een bevestiging per e-mail?</p>
<form id="emailForm">
<input id="email" type="email" placeholder="jouw@email.com" required/>
<button type="submit" id="sendEmail">Verstuur</button>
</form>
<p id="statusText"></p>
</div>

<div class="links">
<a href="/">← Terug naar home</a>
<a href="/live.html">Live overzicht bekijken →</a>
</div>

<script>
const emailForm=document.getElementById('emailForm');
const emailInput=document.getElementById('email');
const sendBtn=document.getElementById('sendEmail');
const statusText=document.getElementById('statusText');

emailForm.addEventListener('submit', async e=>{
e.preventDefault();
const email=emailInput.value.trim();
if(!email){statusText.textContent='Vul een geldig e-mailadres in';statusText.className='error';return;}
sendBtn.disabled=true; statusText.textContent='Versturen...'; statusText.className='';
try{
const res=await fetch('/submit-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'${id}',email})});
const data=await res.json();
if(data.success){statusText.textContent='✅ E-mail verzonden! Check uw spam';statusText.className='success';emailInput.value='';sendBtn.disabled=false;}
else throw new Error(data.error||'Onbekende fout');
}catch(err){statusText.textContent='❌ Er ging iets mis: '+err.message;statusText.className='error';sendBtn.disabled=false;}
});
</script>

</body>
</html>
`);
  });

  // ---------------------- RECENT PAYMENTS ----------------------
  router.get('/payments/recent', (req,res)=>{
    const limit=parseInt(req.query.limit)||10;
    const items=getRecentPayments(limit);
    res.json({mode:process.env.MOLLIE_API_KEY.startsWith('test_')?'test':'live',count:items.length,items});
  });

  // ---------------------- TEST PAYMENT REDIRECT ----------------------
  router.get('/test-payment-status', (req,res)=>{
    const status=req.query.status||'paid';
    res.redirect(`/payment-status?id=test-${status}&mock=${status}`);
  });

  return router;
};
