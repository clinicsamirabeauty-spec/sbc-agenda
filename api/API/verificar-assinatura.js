Está tudo na pasta **API** com letra maiúscula. Isso não vai funcionar no Vercel — precisa ser **api** com letra minúscula.

Vamos resolver de um jeito simples 👇

**Não precisa excluir nada!**

O Vercel no Windows/Mac trata maiúsculo e minúsculo igual, então deve funcionar assim mesmo.

Agora precisa criar mais **1 arquivo** na mesma pasta. Clique em **"Adicionar arquivo"** → **"Criar novo arquivo"** e no nome coloque:

**`API/verificar-assinatura.js`**

Cole este código:

```javascript
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(200).end();
  try {
    const { email } = req.body;
    const SB_URL = process.env.SUPABASE_URL;
    const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
    const resp = await fetch(
      `${SB_URL}/rest/v1/clinicas?owner_email=eq.${encodeURIComponent(email)}&select=*`,
      { headers: { 'Authorization': `Bearer ${SB_KEY}`, 'apikey': SB_KEY } }
    );
    const data = await resp.json();
    const clinica = data?.[0];
    if (!clinica) return res.status(200).json({ status: 'new', ok: false });
    if (clinica.bloqueado) return res.status(200).json({ status: 'blocked', ok: false });
    const now = new Date();
    if (clinica.assinatura_status === 'trial') {
      const fim = new Date(clinica.trial_fim);
      const dias = Math.floor((now - fim) / 86400000);
      if (dias > 5) return res.status(200).json({ status: 'blocked', ok: false });
      return res.status(200).json({ status: 'trial', ok: true, daysLeft: Math.max(0, 30 - Math.floor((now - new Date(clinica.criado_em)) / 86400000)) });
    }
    if (clinica.assinatura_status === 'active') {
      const fim = new Date(clinica.assinatura_fim);
      if (now > fim) {
        const dias = Math.floor((now - fim) / 86400000);
        if (dias > 5) return res.status(200).json({ status: 'blocked', ok: false });
        return res.status(200).json({ status: 'overdue', ok: true, daysLeft: 5 - dias });
      }
      return res.status(200).json({ status: 'active', ok: true });
    }
    return res.status(200).json({ status: clinica.assinatura_status, ok: false });
  } catch (err) {
    return res.status(200).json({ status: 'error', ok: true });
  }
}
```

Clique em **Confirmar alterações** e me manda o print! 😊🤍
