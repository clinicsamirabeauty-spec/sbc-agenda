export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { customerId, plano, cupomDesconto } = req.body;
    const KEY = process.env.ASAAS_API_KEY;
    const PLANOS = {
      mensal: { value: 25.90, cycle: 'MONTHLY' },
      anual:  { value: 297.00, cycle: 'YEARLY' }
    };
    const p = PLANOS[plano];
    if (!p) return res.status(400).json({ error: 'Plano inválido' });
    let valor = p.value;
    if (cupomDesconto > 0) valor = Math.round(valor * (1 - cupomDesconto/100) * 100) / 100;
    const trialFim = new Date();
    trialFim.setDate(trialFim.getDate() + 30);
    const resp = await fetch('https://api.asaas.com/v3/subscriptions', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'content-type': 'application/json', 'access_token': KEY },
      body: JSON.stringify({
        customer: customerId,
        billingType: 'UNDEFINED',
        value: valor,
        nextDueDate: trialFim.toISOString().split('T')[0],
        cycle: p.cycle,
        description: `SBC Agenda - Plano ${plano}`,
        endDate: null,
        maxPayments: null
      })
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(400).json({ error: data.errors?.[0]?.description || 'Erro Asaas' });
    return res.status(200).json({ ok: true, subscriptionId: data.id, status: data.status });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
