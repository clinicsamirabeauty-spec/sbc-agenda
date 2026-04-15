// api/stripe-webhook.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcbzugxmibffzjsdniiu.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook sig error:', err.message);
    return res.status(400).json({ error: err.message });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        const email = session.customer_email || session.customer_details?.email;
        const customerId = session.customer;
        const subscriptionId = session.subscription;
        if (email) {
          await supabase.from('clinicas').upsert({
            owner_email: email.toLowerCase(),
            nome: email.split('@')[0],
            tipo: 'clinica',
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            assinatura_status: 'ativa',
            trial_fim: null
          }, { onConflict: 'owner_email' });
          console.log('✅ Checkout completo:', email);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const customer = await stripe.customers.retrieve(sub.customer);
        const email = customer.email;
        if (email) {
          const fim = new Date(sub.current_period_end * 1000).toISOString();
          const plano = sub.items.data[0]?.price?.recurring?.interval === 'year' ? 'anual' : 'mensal';
          await supabase.from('clinicas').upsert({
            owner_email: email.toLowerCase(),
            stripe_customer_id: sub.customer,
            stripe_subscription_id: sub.id,
            assinatura_status: sub.status === 'active' ? 'ativa' : 'trial',
            plano,
            assinatura_fim: fim
          }, { onConflict: 'owner_email' });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (!invoice.subscription) break;
        const customer = await stripe.customers.retrieve(invoice.customer);
        const email = customer.email;
        if (email) {
          const sub = await stripe.subscriptions.retrieve(invoice.subscription);
          const fim = new Date(sub.current_period_end * 1000).toISOString();
          await supabase.from('clinicas').upsert({
            owner_email: email.toLowerCase(),
            assinatura_status: 'ativa',
            assinatura_fim: fim
          }, { onConflict: 'owner_email' });
          console.log('✅ Pagamento confirmado:', email);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customer = await stripe.customers.retrieve(invoice.customer);
        const email = customer.email;
        if (email) {
          await supabase.from('clinicas')
            .update({ assinatura_status: 'inadimplente' })
            .eq('owner_email', email.toLowerCase());
          console.log('⚠️ Pagamento falhou:', email);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customer = await stripe.customers.retrieve(sub.customer);
        const email = customer.email;
        if (email) {
          await supabase.from('clinicas')
            .update({ assinatura_status: 'cancelada' })
            .eq('owner_email', email.toLowerCase());
          console.log('❌ Cancelada:', email);
        }
        break;
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};
