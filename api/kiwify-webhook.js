// api/kiwify-webhook.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcbzugxmibffzjsdniiu.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const KIWIFY_TOKEN = 'zi2bxphvi0q';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verifica token do Kiwify
  const token = req.query.token || req.headers['x-kiwify-token'];
  if (token !== KIWIFY_TOKEN) {
    console.error('Token invalido:', token);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body;
  const evento = body?.order_status || body?.webhook_event_type || '';
  const email = body?.Customer?.email || body?.customer?.email || '';

  console.log('Kiwify webhook:', evento, email);

  if (!email) {
    console.error('Email nao encontrado no body:', JSON.stringify(body));
    return res.status(200).json({ received: true });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Calcula validade baseado no plano
    const plano = body?.Product?.name?.toLowerCase().includes('anual') ? 'anual' : 'mensal';
    const fim = new Date();
    if (plano === 'anual') {
      fim.setFullYear(fim.getFullYear() + 1);
    } else {
      fim.setMonth(fim.getMonth() + 1);
    }

    switch (evento) {
      // Compra aprovada — libera acesso
      case 'paid':
      case 'approved':
      case 'order_approved':
      case 'subscription_active': {
        // Tenta atualizar primeiro
        const { data: existing } = await supabase
          .from('clinicas')
          .select('owner_email')
          .eq('owner_email', email.toLowerCase())
          .single();

        if (existing) {
          await supabase.from('clinicas')
            .update({
              assinatura_status: 'ativa',
              plano,
              assinatura_fim: fim.toISOString(),
              bloqueado: false
            })
            .eq('owner_email', email.toLowerCase());
        } else {
          // Cria nova clinica
          await supabase.from('clinicas').insert({
            owner_email: email.toLowerCase(),
            nome: body?.Customer?.name || email.split('@')[0],
            tipo: 'clinica',
            plano,
            assinatura_status: 'ativa',
            assinatura_fim: fim.toISOString(),
            bloqueado: false,
            criado_em: new Date().toISOString()
          });
        }
        console.log('✅ Acesso liberado:', email, plano);
        break;
      }

      // Assinatura cancelada ou reembolso — bloqueia
      case 'refunded':
      case 'cancelled':
      case 'subscription_cancelled':
      case 'chargedback': {
        await supabase.from('clinicas')
          .update({
            assinatura_status: 'cancelada',
            bloqueado: true
          })
          .eq('owner_email', email.toLowerCase());
        console.log('❌ Acesso bloqueado:', email);
        break;
      }

      // Assinatura atrasada — marca como inadimplente
      case 'subscription_overdue':
      case 'overdue': {
        await supabase.from('clinicas')
          .update({ assinatura_status: 'inadimplente' })
          .eq('owner_email', email.toLowerCase());
        console.log('⚠️ Inadimplente:', email);
        break;
      }

      // Renovação — renova validade
      case 'subscription_renewed':
      case 'renewed': {
        await supabase.from('clinicas')
          .update({
            assinatura_status: 'ativa',
            assinatura_fim: fim.toISOString(),
            bloqueado: false
          })
          .eq('owner_email', email.toLowerCase());
        console.log('🔄 Renovada:', email);
        break;
      }

      default:
        console.log('Evento ignorado:', evento);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Kiwify webhook error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};
