// api/verificar-assinatura.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcbzugxmibffzjsdniiu.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_EMAIL = 'clinicsamirabeauty@gmail.com';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email obrigatorio' });

  if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    return res.status(200).json({ status: 'ativa', plan: 'admin' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data, error } = await supabase
      .from('clinicas')
      .select('assinatura_status, plano, assinatura_fim, trial_fim, bloqueado')
      .eq('owner_email', email.toLowerCase())
      .single();

    if (error || !data) {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 30);
      await supabase.from('clinicas').insert({
        owner_email: email.toLowerCase(),
        nome: email.split('@')[0],
        tipo: 'clinica',
        plano: 'trial',
        assinatura_status: 'trial',
        trial_fim: trialEnd.toISOString(),
        criado_em: new Date().toISOString()
      });
      return res.status(200).json({ status: 'trial', plan: 'trial', days_left: 30 });
    }

    if (data.bloqueado) return res.status(200).json({ status: 'bloqueado', plan: data.plano });

    if (data.assinatura_status === 'trial' && data.trial_fim) {
      const daysLeft = Math.ceil((new Date(data.trial_fim) - new Date()) / 86400000);
      if (daysLeft <= 0) {
        await supabase.from('clinicas').update({ assinatura_status: 'trial_expirado' }).eq('owner_email', email.toLowerCase());
        return res.status(200).json({ status: 'trial_expirado', plan: 'trial' });
      }
      return res.status(200).json({ status: 'trial', plan: 'trial', days_left: daysLeft });
    }

    if (data.assinatura_status === 'ativa') {
      if (data.assinatura_fim && new Date(data.assinatura_fim) < new Date()) {
        await supabase.from('clinicas').update({ assinatura_status: 'expirada' }).eq('owner_email', email.toLowerCase());
        return res.status(200).json({ status: 'expirada', plan: data.plano });
      }
      return res.status(200).json({ status: 'ativa', plan: data.plano || 'mensal' });
    }

    return res.status(200).json({ status: data.assinatura_status || 'trial_expirado', plan: data.plano });

  } catch (err) {
    return res.status(500).json({ error: 'Erro interno' });
  }
};
