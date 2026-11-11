// Vercel Function: POST /api/set-claim
//
// Gives the signed-in user the custom claim { role: "authenticated" },
// which Supabase needs before the user can upload photos.
// It replaces running "node set-user-claims.cjs" by hand.
//
// The Firebase service account is read from the FIREBASE_SERVICE_ACCOUNT
// environment variable on Vercel. It is never sent to the browser.

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const getAdminAuth = () => {
  if (getApps().length === 0) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (!raw) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is not set on Vercel.');
    }

    initializeApp({ credential: cert(JSON.parse(raw)) });
  }

  return getAuth();
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const header = req.headers.authorization || '';
  const match = /^Bearer (.+)$/.exec(header);

  if (!match) {
    return res.status(401).json({ error: 'Missing login token.' });
  }

  let adminAuth;

  try {
    adminAuth = getAdminAuth();
  } catch (error) {
    console.error('Firebase Admin setup error:', error);
    return res.status(500).json({ error: 'Server is not configured.' });
  }

  // 1. Check that the login token is real and belongs to this user.
  let decoded;

  try {
    decoded = await adminAuth.verifyIdToken(match[1]);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired login token.' });
  }

  // 2. Nothing to do if the user already has the role.
  if (decoded.role === 'authenticated') {
    return res.status(200).json({ updated: false });
  }

  // 3. Add the role and keep any other claims (for example "admin").
  try {
    const user = await adminAuth.getUser(decoded.uid);

    await adminAuth.setCustomUserClaims(decoded.uid, {
      ...(user.customClaims || {}),
      role: 'authenticated',
    });

    return res.status(200).json({ updated: true });
  } catch (error) {
    console.error('Set claim error:', error);
    return res.status(500).json({ error: 'Could not update the account.' });
  }
}