#!/usr/bin/env node

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import admin from 'firebase-admin';

// Read .env.production
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.production');
const envContent = readFileSync(envPath, 'utf8');

const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
}

const projectId = env.FIREBASE_PROJECT_ID;
const clientEmail = env.FIREBASE_CLIENT_EMAIL;
const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  projectId,
});

const db = admin.firestore();

async function main() {
  const snap = await db.collection('subscriptions').get();
  console.log(`Found ${snap.size} subscription document(s):\n`);

  snap.forEach((doc) => {
    const d = doc.data();
    console.log(`--- ${doc.id} ---`);
    console.log('  status:', d.status ?? '(not set)');
    console.log('  plan:', d.plan ?? '(not set)');
    console.log('  stripeSubscriptionId:', d.stripeSubscriptionId ?? '(not set)');
    console.log('  stripeCustomerId:', d.stripeCustomerId ?? '(not set)');
    console.log('  trialEnd:', d.trialEnd ? (d.trialEnd.toDate ? d.trialEnd.toDate().toISOString() : d.trialEnd) : '(not set)');
    console.log('  hasHadTrial:', d.hasHadTrial ?? '(not set)');
    console.log();
  });
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
