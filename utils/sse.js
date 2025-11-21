function setupSSE(app) {
  const clients = new Set();

  app.get('/payments/stream', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();
    clients.add(res);

    console.log('🟢 SSE client connected:', clients.size);
    req.on('close', () => {
      clients.delete(res);
      console.log('🔴 SSE client disconnected:', clients.size);
    });
  });

  function broadcastPayment(payment) {
    const data = JSON.stringify(payment);
    for (const client of clients) {
      client.write(`data: ${data}\n\n`);
    }
    console.log(`📡 Broadcasted ${payment.id} (${payment.status}) to ${clients.size} clients`);
  }

  return { clients, broadcastPayment };
}

module.exports = { setupSSE };
