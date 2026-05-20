#!/usr/bin/env node
// Simple Vercel runtime env validator for staging readiness
const fs = require('fs');
const required = [
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_DATABASE_URL',
  'VERCEL_ENV'
];

console.log('VERCEL ENV CHECK - Horas Extras V2 -', new Date().toISOString());

const missing = required.filter(k => !process.env[k]);
console.log('VERCEL_ENV=', process.env.VERCEL_ENV || '(not set)');

if (fs.existsSync('vercel.json')) console.log('vercel.json found'); else console.warn('vercel.json not found - ensure SPA fallback configured');

if (missing.length) {
  console.error('MISSING_REQUIRED_ENV_VARS:', missing.join(', '));
  console.error('This may cause Firebase initialization failures on deploy.');
  process.exit(2);
}

console.log('All required env vars present.');
process.exit(0);
