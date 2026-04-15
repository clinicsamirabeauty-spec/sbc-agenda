// api/kiwify-webhook.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcbzugxmibffzjsdniiu.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const KIWIFY_TOKEN = 'zi2bxphvi0q';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verifica token
  const token = req.query.token || req.headers['x-kiwify-token'];
  if (token !== KIWIFY_TOKEN) {
    console.error('Token invalido:', token);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Kiwify envia dados dentro de "order"
  const order = req.body?.order || req.body;
  const evento = order?.webhook_event_type || order?.order_status || '';
  const email = order?.Customer?.email || order?.customer?.email || '';
  const planoNome = order?.Subscription?.plan?.name || order?.Product?.product_name || '';
  const plano = planoNome.toLowerCase().includes('anual') ? 'anual' : 'mensal';
  
  // Pega validade do próximo pagamento
  const nextPayment = order?.Subscription?.customer_access?.access_until 
    || order?.Subscription?.next_payment 
    || null;

  console.log('Kiwify evento:', evento, '| email:', email, '| plano:', plano);

  if (!email) {
    console.error('Email nao encontrado');
    return res.status(200).json({ received: true });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Calcula validade
    const fim = nextPayment ? new Date(nextPayment) : new Date();
    if (!nextPayment) {
      plano === 'anual' ? fim.setFullYear(fim.getFullYear() + 1) : fim.setMonth(fim.getMonth() + 1);
    }

    switch (evento) {
      case 'order_approved':
      case 'paid':
      case 'subscription_active': {
        // Verifica se já existe
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
          await supabase.from('clinicas').insert({
            owner_email: email.toLowerCase(),
            nome: order?.Customer?.full_name || email.split('@')[0],
            tipo: 'clinica',
            plano,
            assinatura_status: 'ativa',
            assinatura_fim: fim.toISOString(),
            bloqueado: false,
            criado_em: new Date().toISOString()
          });
        }
        console.log('✅ Acesso liberado:', email);
        break;
      }

      case 'order_refunded':
      case 'subscription_cancelled': {
        await supabase.from('clinicas')
          .update({ assinatura_status: 'cancelada', bloqueado: true })
          .eq('owner_email', email.toLowerCase());
        console.log('❌ Cancelada:', email);
        break;
      }

      case 'subscription_overdue': {
        await supabase.from('clinicas')
          .update({ assinatura_status: 'inadimplente' })
          .eq('owner_email', email.toLowerCase());
        console.log('⚠️ Inadimplente:', email);
        break;
      }

      case 'subscription_renewed': {
        await supabase.from('clinicas')
          .update({ assinatura_status: 'ativa', assinatura_fim: fim.toISOString(), bloqueado: false })
          .eq('owner_email', email.toLowerCase());
        console.log('🔄 Renovada:', email);
        break;
      }

      default:
        console.log('Evento ignorado:', evento);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Erro:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};
