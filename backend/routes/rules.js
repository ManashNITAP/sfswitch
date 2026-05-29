const express = require('express');
const jsforce = require('jsforce');
const router  = express.Router();

// ── Auth middleware - reads token from request headers ────────────
function requireAuth(req, res, next) {
  const token       = req.headers['x-sf-token'];
  const instanceUrl = req.headers['x-sf-instance-url'];

  if (!token || !instanceUrl) {
    return res.status(401).json({ error: 'Not logged in', needsLogin: true });
  }

  req.conn = new jsforce.Connection({ accessToken: token, instanceUrl });
  next();
}

// ── GET /api/rules ────────────────────────────────────────────────
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
    res.json({ ok: true, rules: result.records });
  } catch (err) {
    console.error('Fetch rules error:', err.message);
    if (err.message.includes('INVALID_SESSION_ID') || err.message.includes('expired')) {
      return res.status(401).json({ error: 'Session expired', needsLogin: true });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/deploy ──────────────────────────────────────────────
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
      if (!rule?.Metadata) { errors.push({ ruleId, error: 'Not found' }); continue; }
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

  res.json({
    ok:      errors.length === 0,
    results,
    errors,
    message: `${results.length} deployed, ${errors.length} failed`,
  });
});

module.exports = router;