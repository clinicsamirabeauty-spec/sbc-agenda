export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(200).end();
  try {
    const { type, data } = req.body;
    const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
    const SB_URL = process.env.SUPABASE_URL;
    const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
    if (type === 'payment' && data?.id) {
      const resp = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: { 'Authorization': `Bearer ${MP_TOKEN}` }
      });
      const payment = await resp.json();
      if (payment.status === 'approved') {
        const email = payment.metadata?.email || payment.payer?.email;
        const plano = payment.metadata?.plano || 'mensal';
        const meses = plano === 'anual' ? 12 : 1;
        const fim = new Date();
        fim.setMonth(fim.getMonth() + meses);
        await fetch(`${SB_URL}/rest/v1/clinicas?owner_email=eq.${encodeURIComponent(email)}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${SB_KEY}`, 'apikey': SB_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ assinatura_status: 'active', assinatura_fim: fim.toISOString(), bloqueado: false, plano })
        });
      }
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
