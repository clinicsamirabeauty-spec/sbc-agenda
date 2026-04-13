export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { nome, email, cpf } = req.body;
    const KEY = process.env.ASAAS_API_KEY;
    // Criar cliente no Asaas
    const resp = await fetch('https://api.asaas.com/v3/customers', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'content-type': 'application/json', 'access_token': KEY },
      body: JSON.stringify({ name: nome, email, cpfCnpj: cpf?.replace(/\D/g,'') })
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(400).json({ error: data.errors?.[0]?.description || 'Erro Asaas' });
    return res.status(200).json({ ok: true, customerId: data.id });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
