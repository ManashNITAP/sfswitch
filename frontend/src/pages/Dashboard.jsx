import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams }    from 'react-router-dom';
import axios                                from 'axios';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

// Helper to get auth headers from localStorage
const getHeaders = () => ({
  'x-sf-token':        localStorage.getItem('sf_token')        || '',
  'x-sf-instance-url': localStorage.getItem('sf_instance_url') || '',
});

// ── Toast notification ────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, []);
  const colors = {
    success: 'bg-green-600',
    error:   'bg-red-600',
    info:    'bg-blue-600',
    warning: 'bg-yellow-600',
  };
  return (
    <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3 rounded-xl text-white text-sm shadow-2xl ${colors[type] || colors.info}`}>
      <span>{msg}</span>
      <button onClick={onClose} className="ml-2 text-white/70 hover:text-white text-xl leading-none">×</button>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────
function Spin({ size = 4 }) {
  return (
    <div className={`w-${size} h-${size} border-2 border-white border-t-transparent rounded-full animate-spin`} />
  );
}

export default function Dashboard() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();

  const [user, setUser]           = useState(null);
  const [rules, setRules]         = useState([]);
  const [loading, setLoading]     = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [fetched, setFetched]     = useState(false);
  const [object, setObject]       = useState('Account');
  const [pending, setPending]     = useState(new Map());
  const [toast, setToast]         = useState(null);
  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState('all');

  const showToast = (msg, type = 'info') => setToast({ msg, type });

  // ── On load: read URL params from OAuth or localStorage ───────
  useEffect(() => {
    const token       = searchParams.get('token');
    const instanceUrl = searchParams.get('instanceUrl');
    const username    = searchParams.get('username');
    const email       = searchParams.get('email');
    const orgId       = searchParams.get('orgId');

    if (token && instanceUrl) {
      // Came from OAuth callback — save to localStorage
      localStorage.setItem('sf_token',        token);
      localStorage.setItem('sf_instance_url', instanceUrl);
      localStorage.setItem('sf_username',     username || '');
      localStorage.setItem('sf_email',        email    || '');
      localStorage.setItem('sf_org_id',       orgId    || '');
      setUser({ username, email, instanceUrl, orgId });
      // Clean URL params
      navigate('/dashboard', { replace: true });
    } else {
      // Check localStorage
      const savedToken = localStorage.getItem('sf_token');
      if (savedToken) {
        setUser({
          username:    localStorage.getItem('sf_username'),
          email:       localStorage.getItem('sf_email'),
          instanceUrl: localStorage.getItem('sf_instance_url'),
          orgId:       localStorage.getItem('sf_org_id'),
        });
      } else {
        navigate('/');
      }
    }
  }, []);

  // ── Get effective active status ────────────────────────────────
  const getActive = (rule) =>
    pending.has(rule.Id) ? pending.get(rule.Id) : rule.Active;

  // ── Fetch rules ────────────────────────────────────────────────
  const fetchRules = useCallback(async () => {
    setLoading(true);
    setPending(new Map());
    setFetched(false);
    try {
      const r = await axios.get(`${BACKEND}/api/rules?object=${object}`, { headers: getHeaders() });
      setRules(r.data.rules || []);
      setFetched(true);
      showToast(
        r.data.rules.length
          ? `Fetched ${r.data.rules.length} validation rules from ${object}`
          : `No validation rules found on ${object}`,
        r.data.rules.length ? 'success' : 'info'
      );
    } catch (e) {
      if (e.response?.data?.needsLogin) {
        showToast('Session expired. Please login again.', 'error');
        localStorage.clear();
        setTimeout(() => navigate('/'), 2000);
      } else {
        showToast(e.response?.data?.error || 'Failed to fetch rules', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [object]);

  // ── Toggle a single rule (local only) ──────────────────────────
  const toggle = (rule) => {
    const next = !getActive(rule);
    setPending(prev => {
      const m = new Map(prev);
      if (next === rule.Active) m.delete(rule.Id);
      else m.set(rule.Id, next);
      return m;
    });
  };

  // ── Stage all rules ────────────────────────────────────────────
  const stageAll = (active) => {
    const m = new Map();
    rules.forEach(r => { if (r.Active !== active) m.set(r.Id, active); });
    if (m.size === 0) return showToast(`All rules are already ${active ? 'active' : 'inactive'}`, 'info');
    setPending(m);
    showToast(`${m.size} rules staged to ${active ? 'enable' : 'disable'} — click Deploy to apply`, 'info');
  };

  // ── Deploy changes to Salesforce ───────────────────────────────
  const deploy = async () => {
    if (!pending.size) return showToast('No changes to deploy', 'info');
    if (!confirm(`Deploy ${pending.size} change(s) to your Salesforce org?`)) return;

    setDeploying(true);
    const changes = Array.from(pending.entries()).map(([ruleId, active]) => ({ ruleId, active }));

    try {
      const r = await axios.post(`${BACKEND}/api/deploy`, { changes }, { headers: getHeaders() });

      if (r.data.ok) {
        setRules(prev => prev.map(rule =>
          pending.has(rule.Id) ? { ...rule, Active: pending.get(rule.Id) } : rule
        ));
        setPending(new Map());
        showToast(r.data.message, 'success');
      } else {
        showToast(`Partial deploy: ${r.data.message}`, 'warning');
        const successIds = new Set(r.data.results.map(r => r.ruleId));
        setRules(prev => prev.map(rule =>
          successIds.has(rule.Id) ? { ...rule, Active: pending.get(rule.Id) } : rule
        ));
        setPending(prev => {
          const m = new Map(prev);
          successIds.forEach(id => m.delete(id));
          return m;
        });
      }
    } catch (e) {
      showToast(e.response?.data?.error || 'Deploy failed', 'error');
    } finally {
      setDeploying(false);
    }
  };

  // ── Logout ─────────────────────────────────────────────────────
  const logout = () => {
    if (!confirm('Are you sure you want to logout?')) return;
    localStorage.clear();
    navigate('/');
  };

  // ── Filtered rules ─────────────────────────────────────────────
  const shown = rules.filter(r => {
    const q      = search.toLowerCase();
    const matchQ = (r.ValidationName || '').toLowerCase().includes(q) ||
                   (r.Description    || '').toLowerCase().includes(q);
    const active = getActive(r);
    if (filter === 'active')   return matchQ && active;
    if (filter === 'inactive') return matchQ && !active;
    return matchQ;
  });

  const activeCount   = rules.filter(r => getActive(r)).length;
  const inactiveCount = rules.length - activeCount;

  return (
    <div className="min-h-screen bg-gray-100">

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* ── Navbar ───────────────────────────────────────────── */}
      <nav className="bg-[#032D60] text-white px-6 py-4 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <div className="bg-[#00A1E0] rounded-lg p-1.5">
            <svg width="28" height="20" viewBox="0 0 80 56" fill="none">
              <path d="M33 8C27 8 22 12.5 20.5 18.5C18 17.3 15.2 16.5 12.2 16.5C5.5 16.5 0 22 0 29C0 36 5.5 41.5 12.2 41.5H67.8C74.5 41.5 80 36 80 29C80 22.1 74.6 16.6 67.9 16.5C67 13.5 64.4 11 61.2 11C59.3 11 57.6 11.7 56.2 12.9C53.5 10 49.7 8 45.5 8C44.5 8 43.6 8.1 42.7 8.3C40.5 8 38.2 8 36.1 8.5" fill="white"/>
            </svg>
          </div>
          <span className="font-bold text-lg tracking-tight">Salesforce Switch</span>
        </div>

        {user && (
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full">
              <div className="w-6 h-6 bg-[#00A1E0] rounded-full flex items-center justify-center text-xs font-bold uppercase">
                {user.username?.charAt(0) || 'U'}
              </div>
              <div className="text-xs">
                <p className="font-semibold leading-tight">{user.username}</p>
                <p className="text-blue-300 leading-tight truncate max-w-[180px]">
                  {user.instanceUrl?.replace('https://', '')}
                </p>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 bg-green-900/40 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              <span className="text-xs text-green-300 font-medium">Connected</span>
            </div>

            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-sm text-blue-200 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        )}
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* ── Controls card ─────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Validation Rules</h2>
              <p className="text-sm text-gray-400 mt-0.5">
                {user ? `Managing rules for ${user.username}` : 'Loading...'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Salesforce Object
              </label>
              <select
                value={object}
                onChange={e => {
                  setObject(e.target.value);
                  setFetched(false);
                  setRules([]);
                  setPending(new Map());
                }}
                disabled={loading}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[150px]"
              >
                <option>Account</option>
                <option>Contact</option>
                <option>Opportunity</option>
                <option>Lead</option>
                <option>Case</option>
              </select>
            </div>

            <button
              onClick={fetchRules}
              disabled={loading}
              className="flex items-center gap-2 bg-[#00A1E0] hover:bg-[#0087be] disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
            >
              {loading
                ? <><Spin /> Fetching...</>
                : fetched
                  ? '🔄 Refresh Rules'
                  : '📋 Get Validation Rules'
              }
            </button>

            {fetched && rules.length > 0 && (
              <>
                <button
                  onClick={() => stageAll(true)}
                  disabled={deploying}
                  className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  ✅ Enable All
                </button>
                <button
                  onClick={() => stageAll(false)}
                  disabled={deploying}
                  className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  🚫 Disable All
                </button>
              </>
            )}

            {pending.size > 0 && (
              <>
                <button
                  onClick={() => { setPending(new Map()); showToast('Changes discarded', 'info'); }}
                  disabled={deploying}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  ✕ Discard
                </button>
                <button
                  onClick={deploy}
                  disabled={deploying}
                  className="flex items-center gap-2 bg-[#032D60] hover:bg-blue-900 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors shadow-md"
                >
                  {deploying
                    ? <><Spin /> Deploying...</>
                    : `🚀 Deploy ${pending.size} Change${pending.size !== 1 ? 's' : ''}`
                  }
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Pending banner ────────────────────────────────── */}
        {pending.size > 0 && !deploying && (
          <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-yellow-800">
            ⏳
            <span>
              <strong>{pending.size} unsaved change{pending.size !== 1 ? 's' : ''}</strong>
              {' '}— click <strong>Deploy</strong> to apply to your Salesforce org
            </span>
          </div>
        )}

        {/* ── Loading state ─────────────────────────────────── */}
        {loading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 py-24 flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-[#00A1E0] border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 text-sm font-medium">Fetching from Salesforce...</p>
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────── */}
        {!fetched && !loading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 py-24 text-center">
            <p className="text-6xl mb-4">☁️</p>
            <p className="text-lg font-semibold text-gray-700">Ready to fetch your validation rules</p>
            <p className="text-sm text-gray-400 mt-2">
              Select an object above and click <strong>Get Validation Rules</strong>
            </p>
            <button
              onClick={fetchRules}
              className="mt-6 inline-flex items-center gap-2 bg-[#00A1E0] hover:bg-[#0087be] text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            >
              📋 Get Validation Rules
            </button>
          </div>
        )}

        {/* ── Rules table ───────────────────────────────────── */}
        {fetched && !loading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">

            <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap gap-3 items-center justify-between">
              <div className="flex gap-5 text-sm text-gray-500">
                <span>Total: <strong className="text-gray-800">{rules.length}</strong></span>
                <span>Active: <strong className="text-green-600">{activeCount}</strong></span>
                <span>Inactive: <strong className="text-gray-500">{inactiveCount}</strong></span>
                {pending.size > 0 && (
                  <span>Pending: <strong className="text-yellow-600">{pending.size}</strong></span>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search rules..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-44"
                />
                <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
                  {['all', 'active', 'inactive'].map(f => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-3 py-1.5 capitalize transition-colors ${
                        filter === f ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {rules.length === 0 && (
              <div className="py-20 text-center text-gray-400">
                <p className="text-4xl mb-3">📋</p>
                <p className="font-semibold text-gray-600">No validation rules found on {object}</p>
                <p className="text-sm mt-2">
                  Create some in Salesforce Setup → Object Manager → {object} → Validation Rules
                </p>
              </div>
            )}

            {rules.length > 0 && (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-3">Rule Name</th>
                    <th className="px-6 py-3">Description</th>
                    <th className="px-6 py-3 text-center">Status</th>
                    <th className="px-6 py-3 text-center">Toggle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shown.map(rule => {
                    const active     = getActive(rule);
                    const isModified = pending.has(rule.Id);

                    return (
                      <tr
                        key={rule.Id}
                        className={`transition-colors hover:bg-gray-50 ${isModified ? 'bg-yellow-50/50' : ''}`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">{rule.ValidationName}</span>
                            {isModified && (
                              <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded font-medium">
                                Modified
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-500 max-w-xs truncate">
                            {rule.Description || <span className="italic text-gray-300">No description</span>}
                          </p>
                        </td>

                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                            active
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-gray-100 text-gray-500 border-gray-200'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-green-500' : 'bg-gray-400'}`} />
                            {active ? 'Active' : 'Inactive'}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => toggle(rule)}
                            disabled={deploying}
                            title={active ? 'Click to deactivate' : 'Click to activate'}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                              active ? 'bg-green-500' : 'bg-gray-300'
                            }`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                              active ? 'translate-x-6' : 'translate-x-1'
                            }`} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {shown.length === 0 && rules.length > 0 && (
              <div className="py-12 text-center text-gray-400 text-sm">
                No rules match your search or filter
              </div>
            )}

            {rules.length > 0 && (
              <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                <span>Showing {shown.length} of {rules.length} rules</span>
                {pending.size > 0 && (
                  <span className="text-yellow-600 font-medium">
                    {pending.size} unsaved change{pending.size !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
