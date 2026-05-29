require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const session = require('express-session');

const app  = express();
const PORT = process.env.PORT || 5000;

// ⬇️ NEW LINE — trust Render's proxy
app.set('trust proxy', 1);

// ── CORS ──────────────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── SESSION ───────────────────────────────────────────────────────
app.use(session({
  secret:            process.env.SESSION_SECRET || 'secret',
  resave:            true,
  saveUninitialized: true,
  proxy:             true,  // ⬅️ NEW LINE — required for Render
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge:   8 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  },
}));

// ── ROUTES ────────────────────────────────────────────────────────
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/rules'));

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});