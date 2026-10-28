const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../supabase');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function publicUser(user) { return { id: user.id, name: user.name, email: user.email, role: user.role }; }
function makeToken(user) { return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '8h', issuer: 'projecthub-api', audience: 'projecthub-client' }); }

router.post('/register', async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
    if (email.length > 254 || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Password must be between 8 and 72 characters.' });
    const { data: existing, error: findError } = await supabase.from('app_users').select('id').eq('email', email).maybeSingle();
    if (findError) throw findError;
    if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });
    const password_hash = await bcrypt.hash(password, 12);
    // Public registration always creates a student. A trusted administrator promotes mentors in SQL.
    const { data: user, error } = await supabase.from('app_users').insert({ name, email, password_hash, role: 'student' }).select('id,name,email,role').single();
    if (error) { if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' }); throw error; }
    return res.status(201).json({ token: makeToken(user), user: publicUser(user) });
  } catch (error) { next(error); }
});
router.post('/login', async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!EMAIL_RE.test(email) || !password || password.length > 72) return res.status(400).json({ error: 'Enter a valid email and password.' });
    const { data: user, error } = await supabase.from('app_users').select('id,name,email,role,password_hash').eq('email', email).maybeSingle();
    if (error) throw error;
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    return res.json({ token: makeToken(user), user: publicUser(user) });
  } catch (error) { next(error); }
});
router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
module.exports = router;
