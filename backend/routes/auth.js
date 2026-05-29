const express = require('express');
const router  = express.Router();

// ── GET /auth/login ───────────────────────────────────────────────
router.get('/auth/login', (req, res) => {
  const loginUrl = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';

  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.SF_CLIENT_ID,
    redirect_uri:  process.env.SF_REDIRECT_URI,
    scope:         'full refresh_token offline_access',
  });

  const authUrl = `${loginUrl}/services/oauth2/authorize?${params.toString()}`;
  console.log('🔀 Redirecting to Salesforce...');
  res.redirect(authUrl);
});

// ── GET /oauth/callback ───────────────────────────────────────────
router.get('/oauth/callback', async (req, res) => {
  const front = process.env.FRONTEND_URL || 'http://localhost:5173';
  const { code, error, error_description } = req.query;

  if (error) {
    return res.redirect(`${front}?error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code) {
    return res.redirect(`${front}?error=No+code+received`);
  }

  try {
    const loginUrl = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
    const tokenUrl = `${loginUrl}/services/oauth2/token`;

    const body = new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      client_id:     process.env.SF_CLIENT_ID,
      client_secret: process.env.SF_CLIENT_SECRET,
      redirect_uri:  process.env.SF_REDIRECT_URI,
    });

    const tokenRes  = await fetch(tokenUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }

    // Get user info
    const userRes  = await fetch(`${tokenData.instance_url}/services/oauth2/userinfo`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userRes.json();

    // Pass token to frontend via URL params
    const params = new URLSearchParams({
      token:       tokenData.access_token,
      instanceUrl: tokenData.instance_url,
      username:    userInfo.name || userInfo.preferred_username || '',
      email:       userInfo.email || '',
      orgId:       userInfo.organization_id || '',
    });

    console.log(`✅ User logged in: ${userInfo.name}`);
    res.redirect(`${front}/dashboard?${params.toString()}`);

  } catch (err) {
    console.error('OAuth error:', err.message);
    res.redirect(`${front}?error=${encodeURIComponent(err.message)}`);
  }
});

// ── POST /auth/logout ─────────────────────────────────────────────
router.post('/auth/logout', (req, res) => {
  res.json({ ok: true });
});

module.exports = router;