// Serverless endpoint for creating Auth users and Firestore profile
// Deploy this file to Vercel (api/createUser.js). Requires env var
// FIREBASE_SERVICE_ACCOUNT containing the service account JSON string.

const adminPkg = require('firebase-admin');

let admin = adminPkg;
if (!admin.apps || !admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.error('Missing FIREBASE_SERVICE_ACCOUNT env var');
  } else {
    let sa;
    try {
      sa = JSON.parse(raw);
    } catch (e) {
      console.error('FIREBASE_SERVICE_ACCOUNT must be a valid JSON string');
    }
    if (sa) {
      admin.initializeApp({
        credential: admin.credential.cert(sa),
        projectId: sa.project_id
      });
    }
  }
}

const firestore = admin.firestore ? admin.firestore() : null;

module.exports = async function (req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!admin.auth) return res.status(500).json({ error: 'Firebase Admin not initialized' });

  const { email, password, name, role = 'user', office = 'PhilHealth Regional Office 1 (PRO 1)' } = req.body || {};
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Invalid payload: email and password (min 6) required' });
  }

  try {
    // Avoid duplicate by checking existing user
    try {
      const existing = await admin.auth().getUserByEmail(email.toLowerCase());
      return res.status(409).json({ error: 'User already exists', uid: existing.uid });
    } catch (e) {
      // getUserByEmail throws if not found — ignore
    }

    const userRecord = await admin.auth().createUser({
      email: email.toLowerCase(),
      password,
      displayName: name
    });

    if (firestore) {
      await firestore.collection('users').doc(userRecord.uid).set({
        uid: userRecord.uid,
        email: email.toLowerCase(),
        displayName: name,
        role,
        office,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isActive: true
      }, { merge: true });
    }

    // Optionally, you can send a password reset email here using Admin SDK (not supported),
    // so return success and let client trigger a reset email if needed.

    return res.status(200).json({ uid: userRecord.uid });
  } catch (error) {
    console.error('createUser error', error);
    return res.status(500).json({ error: error.message || String(error) });
  }
};
