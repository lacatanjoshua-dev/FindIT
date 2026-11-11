// Vercel Function: POST /api/set-claim
//
// Gives the signed-in user the custom claim { role: "authenticated" },
// which Supabase needs before the user can upload photos.
// It replaces running "node set-user-claims.cjs" by hand.
//
// The Firebase service account is read from the FIREBASE_SERVICE_ACCOUNT
// environment variable on Vercel. It is never sent to the browser.

let adminAuthPromise = null;

// Loads firebase-admin only when needed, so a setup problem returns a clear
// JSON error instead of crashing the whole function.
const getAdminAuth = () => {
  if (!adminAuthPromise) {
    adminAuthPromise = (async () => {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

      if (!raw) {
        throw new SetupError('FIREBASE_SERVICE_ACCOUNT is not set on Vercel.');
      }

      let serviceAccount;

      try {
        serviceAccount = JSON.parse(raw);
      } catch {
        // Never echo the value: it contains the private key.
        throw new SetupError(
          'FIREBASE_SERVICE_ACCOUNT is not valid JSON. Paste the whole serviceAccountKey.json file, from { to }.'
        );
      }

      if (typeof serviceAccount.private_key === 'string') {
        // Some copy-pastes turn real line breaks into "\n" text.
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }

      let appModule;
      let authModule;

      try {
        appModule = await import('firebase-admin/app');
        authModule = await import('firebase-admin/auth');
      } catch (error) {
        throw new SetupError(
          `Could not load firebase-admin: ${error && error.message ? error.message : error}`
        );
      }

      const { cert, getApps, initializeApp } = appModule;

      try {
        if (getApps().length === 0) {
          initializeApp({ credential: cert(serviceAccount) });
        }
      } catch (error) {
        throw new SetupError(
          `Firebase Admin could not start: ${error && error.code ? error.code : 'check the service account'}`
        );
      }

      return authModule.getAuth();
    })().catch((error) => {
      // Allow a retry on the next request.
      adminAuthPromise = null;
      throw error;
    });
  }

  return adminAuthPromise;
};

class SetupError extends Error {}

// The Android app (Capacitor) runs on https://localhost, so it calls this
// function from another origin. Only these origins are allowed.
const ALLOWED_ORIGINS = new Set([
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
]);

const setCors = (req, res) => {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
};

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

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
    adminAuth = await getAdminAuth();
  } catch (error) {
    console.error('Firebase Admin setup error:', error);
    return res.status(500).json({
      error: error instanceof SetupError ? error.message : 'Server is not configured.',
    });
  }

  // 1. Check that the login token is real and belongs to this user.
  let decoded;

  try {
    decoded = await adminAuth.verifyIdToken(match[1]);
  } catch (error) {
    console.error('Token check failed:', error && error.code);
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