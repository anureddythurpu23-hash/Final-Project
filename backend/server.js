require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const submissionRoutes = require('./routes/submissions');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be configured and contain at least 32 characters.');
  process.exit(1);
}
const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"] } } }));
app.use(express.json({ limit: '30kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many authentication attempts. Please wait 15 minutes and try again.' } }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'projecthub-api' }));
app.use('/api/auth', authRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('/{*splat}', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});
app.use((err, _req, res, _next) => {
  // Log server-side for diagnosis, but never return database details or stack traces to clients.
  console.error('[api-error]', err.message || 'Unknown server error');
  if (res.headersSent) return;
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must contain valid JSON.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
  return res.status(500).json({ error: 'The server could not complete the request. Check server configuration and try again.' });
});
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`ProjectHub is running at http://localhost:${port}`));
