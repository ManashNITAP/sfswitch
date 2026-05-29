import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

axios.defaults.withCredentials = true;

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export default function Login() {
  const [searchParams] = useSearchParams();
  const [error, setError]       = useState(searchParams.get('error') || '');
  const [checking, setChecking] = useState(true);

  // Check if already logged in — if yes go straight to dashboard
  useEffect(() => {
    axios.get(`${BACKEND}/auth/status`)
      .then(r => {
        if (r.data.loggedIn) {
          window.location.href = '/dashboard';
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const login = () => {
    // Go to backend which redirects to Salesforce
    window.location.href = `${BACKEND}/auth/login`;
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#032D60] to-[#00A1E0]">
        <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#032D60] to-[#00A1E0] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-md text-center">

        {/* Salesforce cloud logo */}
        <div className="flex justify-center mb-6">
          <div className="bg-[#00A1E0] rounded-2xl p-4 shadow-lg">
            <svg width="56" height="40" viewBox="0 0 80 56" fill="none">
              <path d="M33 8C27 8 22 12.5 20.5 18.5C18 17.3 15.2 16.5 12.2 16.5C5.5 16.5 0 22 0 29C0 36 5.5 41.5 12.2 41.5H67.8C74.5 41.5 80 36 80 29C80 22.1 74.6 16.6 67.9 16.5C67 13.5 64.4 11 61.2 11C59.3 11 57.6 11.7 56.2 12.9C53.5 10 49.7 8 45.5 8C44.5 8 43.6 8.1 42.7 8.3C40.5 8 38.2 8 36.1 8.5" fill="white"/>
            </svg>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-gray-800 mb-2">Salesforce Switch</h1>
        <p className="text-gray-500 mb-2 text-sm leading-relaxed">
          Enable and disable Validation Rules in your Salesforce org.
        </p>
        <p className="text-gray-400 mb-8 text-xs">
          Login with your own Salesforce account to manage your rules.
        </p>

        {/* Error message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            ⚠️ {decodeURIComponent(error)}
          </div>
        )}

        {/* Login button */}
        <button
          onClick={login}
          className="w-full bg-[#00A1E0] hover:bg-[#0087be] text-white font-semibold py-4 px-6 rounded-xl text-base transition-all duration-200 flex items-center justify-center gap-3 shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
        >
          <svg width="24" height="18" viewBox="0 0 80 56" fill="none">
            <path d="M33 8C27 8 22 12.5 20.5 18.5C18 17.3 15.2 16.5 12.2 16.5C5.5 16.5 0 22 0 29C0 36 5.5 41.5 12.2 41.5H67.8C74.5 41.5 80 36 80 29C80 22.1 74.6 16.6 67.9 16.5C67 13.5 64.4 11 61.2 11C59.3 11 57.6 11.7 56.2 12.9C53.5 10 49.7 8 45.5 8C44.5 8 43.6 8.1 42.7 8.3C40.5 8 38.2 8 36.1 8.5" fill="white"/>
          </svg>
          Login with Salesforce
        </button>

        <p className="text-xs text-gray-400 mt-6 leading-relaxed">
          🔒 Your credentials go directly to Salesforce.<br />
          No data is stored on our servers.
        </p>

        {/* Feature list */}
        <div className="mt-8 grid grid-cols-3 gap-3 text-center">
          {[
            { icon: '🔍', text: 'View Rules' },
            { icon: '⚡', text: 'Toggle Rules' },
            { icon: '🚀', text: 'Deploy Changes' },
          ].map(f => (
            <div key={f.text} className="bg-gray-50 rounded-xl p-3">
              <p className="text-xl">{f.icon}</p>
              <p className="text-xs text-gray-500 mt-1 font-medium">{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
