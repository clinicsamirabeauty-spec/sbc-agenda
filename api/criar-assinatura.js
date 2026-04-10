// api/criar-assinatura.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { plano, email, nome, cupom, metodo, cardToken } = req.body;
    const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
    if (!MP_TOKEN) return res.status(500).json({ error: 'Token não configurado' });
    const PLANOS = {
      mensal: { valor: 25.90, titulo: 'SBC Agenda - Plano Mensal' },
      anual:  { valor: 297.00, titulo: 'SBC Agenda - Plano Anual' }
    };
    const planoInfo = PLANOS[plano];
    if (!planoInfo) return res.status(400).json({ error: 'Plano inválido' });
    let valorFinal = planoInfo.valor;
    if (cupom?.desconto_valor) valorFinal = Math.round(valorFinal * (1 - cupom.desconto_valor/100) * 100) / 100;
    const body = {
      items: [{ title: planoInfo.titulo, quantity: 1, unit_price: valorFinal, currency_id: 'BRL' }],
      payer: { email, name: nome },
      back_urls: { success: 'https://sbc-agenda.vercel.app?payment=success', failure: 'https://sbc-agenda.vercel.app?payment=failure' },
      auto_return: 'approved',
      notification_url: 'https://sbc-agenda.vercel.app/api/webhook-mp',
      metadata: { plano, email }
    };
    const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(400).json({ error: data.message });
    return res.status(200).json({ ok: true, init_point: data.init_point, id: data.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
