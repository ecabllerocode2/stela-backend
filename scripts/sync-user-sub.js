import Stripe from 'stripe';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

if (!admin.apps.length) {
  const sa = JSON.parse(readFileSync('./scripts/service-account-key.json', 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}
const db = admin.firestore();

const subs = await stripe.subscriptions.list({ customer: 'cus_U0koBZ5tMAMFeZ', limit: 1 });
const sub = subs.data[0];
console.log('Sub ID:', sub.id);
console.log('Status:', sub.status);

const item = sub.items.data[0];
const start = item.current_period_start;
const end = item.current_period_end;
console.log('Period start:', new Date(start * 1000));
console.log('Period end:', new Date(end * 1000));

const priceId = item.price.id;
const planId = priceId === 'price_1T2htnF3MGdoH0koKWyIHJ2s' ? 'emprendedor' : 'business';
console.log('Plan:', planId);

const userId = 'jseFva56RUaTluRrFf3AIacWve02';
await db.collection('subscriptions').doc(userId).set({
  stripeCustomerId: 'cus_U0koBZ5tMAMFeZ',
  stripeSubscriptionId: sub.id,
  plan: planId,
  status: sub.status,
  currentPeriodStart: new Date(start * 1000),
  currentPeriodEnd: new Date(end * 1000),
  cancelAtPeriodEnd: sub.cancel_at_period_end || false,
  hasHadTrial: true,
  trialEnd: null,
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
}, { merge: true });

console.log('Firestore updated!');

const doc = await db.collection('subscriptions').doc(userId).get();
console.log('Doc:', JSON.stringify(doc.data(), null, 2));
process.exit(0);
