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
  console.log('🔀 Redirecting to Salesforce login...');
  res.redirect(authUrl);
});

// ── GET /oauth/callback ───────────────────────────────────────────
router.get('/oauth/callback', async (req, res) => {
  const front = process.env.FRONTEND_URL || 'http://localhost:5173';
  const { code, error, error_description } = req.query;

  if (error) {
    console.error('SF OAuth error:', error_description);
    return res.redirect(`${front}?error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code) {
    return res.redirect(`${front}?error=No+authorization+code+received`);
  }

  try {
    const loginUrl = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
    const tokenUrl = `${loginUrl}/services/oauth2/token`;

    // DEBUG LOGGING
    console.log('=== TOKEN EXCHANGE DEBUG ===');
    console.log('SF_LOGIN_URL:', process.env.SF_LOGIN_URL);
    console.log('Token URL:', tokenUrl);
    console.log('Client ID exists:', !!process.env.SF_CLIENT_ID);
    console.log('Client Secret exists:', !!process.env.SF_CLIENT_SECRET);
    console.log('Redirect URI:', process.env.SF_REDIRECT_URI);

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

    console.log('Token response status:', tokenRes.status);

    if (!tokenRes.ok || tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error || 'Token exchange failed');
    }

    // Get user info
    const userRes  = await fetch(`${tokenData.instance_url}/services/oauth2/userinfo`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userRes.json();

    // Save in session
    req.session.accessToken  = tokenData.access_token;
    req.session.refreshToken = tokenData.refresh_token;
    req.session.instanceUrl  = tokenData.instance_url;
    req.session.username     = userInfo.name || userInfo.preferred_username || '';
    req.session.email        = userInfo.email || '';
    req.session.orgId        = userInfo.organization_id || '';

    console.log(`✅ User logged in: ${req.session.username}`);

    req.session.save(() => res.redirect(`${front}/dashboard`));

  } catch (err) {
    console.error('OAuth callback error:', err.message);
    console.error('Full error:', err);
    res.redirect(`${front}?error=${encodeURIComponent(err.message)}`);
  }
});

// ── GET /auth/status ──────────────────────────────────────────────
router.get('/auth/status', (req, res) => {
  if (req.session && req.session.accessToken) {
    res.json({
      loggedIn:    true,
      username:    req.session.username,
      email:       req.session.email,
      instanceUrl: req.session.instanceUrl,
      orgId:       req.session.orgId,
    });
  } else {
    res.json({ loggedIn: false });
  }
});

// ── POST /auth/logout ─────────────────────────────────────────────
router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

module.exports = router;