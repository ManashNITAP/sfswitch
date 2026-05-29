const express = require('express');
const jsforce = require('jsforce');
const router  = express.Router();

// ── Auth middleware ───────────────────────────────────────────────
// Checks if user is logged in via their own session
// Each user has their own token - no credentials are shared
function requireAuth(req, res, next) {
  if (!req.session || !req.session.accessToken) {
    return res.status(401).json({
      error:      'Not logged in. Please login with Salesforce first.',
      needsLogin: true,
    });
  }

  // Create connection using THIS user's own token
  req.conn = new jsforce.Connection({
    accessToken: req.session.accessToken,
    instanceUrl: req.session.instanceUrl,
  });

  next();
}

// ── GET /api/rules ────────────────────────────────────────────────
// Fetches validation rules from THE USER'S OWN Salesforce org
router.get('/api/rules', requireAuth, async (req, res) => {
  const obj = req.query.object || 'Account';
  try {
    const result = await req.conn.tooling.query(`
      SELECT Id, ValidationName, Description, Active, ErrorMessage,
             EntityDefinition.QualifiedApiName
      FROM   ValidationRule
      WHERE  EntityDefinition.QualifiedApiName = '${obj}'
      ORDER  BY ValidationName ASC
    `);

    console.log(`Fetched ${result.records.length} rules for ${req.session.username}`);
    res.json({ ok: true, rules: result.records });

  } catch (err) {
    console.error('Fetch rules error:', err.message);

    // If session expired, tell frontend to re-login
    if (err.message.includes('INVALID_SESSION_ID') || err.message.includes('expired')) {
      req.session.destroy();
      return res.status(401).json({ error: 'Session expired. Please login again.', needsLogin: true });
    }

    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/deploy ──────────────────────────────────────────────
// Deploys changes to THE USER'S OWN Salesforce org
router.post('/api/deploy', requireAuth, async (req, res) => {
  const { changes } = req.body;

  if (!changes || !changes.length) {
    return res.status(400).json({ error: 'No changes provided' });
  }

  const results = [];
  const errors  = [];

  for (const { ruleId, active } of changes) {
    try {
      const rule = await req.conn.tooling.retrieve('ValidationRule', ruleId);
      if (!rule?.Metadata) {
        errors.push({ ruleId, error: 'Rule not found' });
        continue;
      }

      const r = await req.conn.tooling.update('ValidationRule', {
        Id:       ruleId,
        Metadata: { ...rule.Metadata, active },
      });

      if (r.success) results.push({ ruleId, active });
      else errors.push({ ruleId, error: 'Update failed' });

    } catch (e) {
      errors.push({ ruleId, error: e.message });
    }
  }

  console.log(`Deploy for ${req.session.username}: ${results.length} success, ${errors.length} failed`);

  res.json({
    ok:      errors.length === 0,
    results,
    errors,
    message: `${results.length} deployed, ${errors.length} failed`,
  });
});

module.exports = router;
