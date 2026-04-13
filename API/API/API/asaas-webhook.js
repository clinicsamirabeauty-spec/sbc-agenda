export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).end();
  try {
    const { event, payment } = req.body;
    const SB_URL = process.env.SUPABASE_URL;
    const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
      const email = payment?.customer?.email;
      const subscriptionId = payment?.subscription;
      if (!email) return res.status(200).json({ ok: true });
      const meses = payment?.description?.includes('anual') ? 12 : 1;
      const fim = new Date();
      fim.setMonth(fim.getMonth() + meses);
      await fetch(`${SB_URL}/rest/v1/clinicas?owner_email=eq.${encodeURIComponent(email)}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${SB_KEY}`,
          'apikey': SB_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          assinatura_status: 'active',
          assinatura_fim: fim.toISOString(),
          bloqueado: false,
          asaas_subscription_id: subscriptionId
        })
      });
    }
    if (event === 'PAYMENT_OVERDUE') {
      const email = payment?.customer?.email;
      if (!email) return res.status(200).json({ ok: true });
      const vencimento = new Date(payment?.dueDate);
      const hoje = new Date();
      const diasAtraso = Math.floor((hoje - vencimento) / 86400000);
      if (diasAtraso > 5) {
        await fetch(`${SB_URL}/rest/v1/clinicas?owner_email=eq.${encodeURIComponent(email)}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${SB_KEY}`,
            'apikey': SB_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ bloqueado: true, bloqueado_em: new Date().toISOString() })
        });
      }
    }
    return res.status(200).json({ ok: true });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
