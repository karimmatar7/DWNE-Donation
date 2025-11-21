const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,      // smtp-auth.mailprotect.be
  port: 587,                          // TLS port
  secure: false,                      // false for TLS (STARTTLS)
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false         // optional, helps avoid certificate issues
  }
});


async function sendConfirmationEmail(to, payment) {
  if (!to) return;

  const subject = `Bevestiging van je donatie – €${payment.amount}`;
  const html = `
  <div style="font-family:Arial,sans-serif;color:#ddd;background:#0f0f0f;padding:30px;text-align:center;">
    <div style="max-width:500px;margin:auto;background:#111;border-radius:10px;padding:30px;border:1px solid rgba(157,19,19,0.4);box-shadow:0 0 20px rgba(157,19,19,0.25);">
      <h2 style="color:#ff3d3d;margin-bottom:10px;">Bedankt, ${payment.name}!</h2>
      <p style="font-size:16px;color:#ccc;">We hebben je donatie van <strong>€${payment.amount}</strong> succesvol ontvangen.</p>
      <p style="font-style:italic;color:#999;">"${payment.message}"</p>
      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:20px 0;">
      <p style="color:#bbb;">Je steun betekent enorm veel voor ons ❤️</p>
      <p style="font-size:13px;color:#777;">De weg naar evenwicht Project – ${new Date().toLocaleDateString()}</p>
    </div>
  </div>
  `;

  try {
    await transporter.sendMail({
      from: `"De weg naar evenwicht" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`📧 Confirmation email sent to ${to}`);
  } catch (err) {
    console.error('❌ Email send error:', err.message);
  }
}

module.exports = { transporter, sendConfirmationEmail };
