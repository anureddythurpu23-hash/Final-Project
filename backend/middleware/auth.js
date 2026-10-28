const jwt = require('jsonwebtoken');
const supabase = require('../supabase');

async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: 'Please log in to continue.' });
  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!payload.sub) return res.status(401).json({ error: 'Invalid session. Please log in again.' });
    const { data: user, error } = await supabase.from('app_users').select('id,name,email,role').eq('id', payload.sub).maybeSingle();
    if (error) throw error;
    if (!user) return res.status(401).json({ error: 'Your account is no longer available. Please log in again.' });
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') {
      return res.status(401).json({ error: 'Your session is invalid or expired. Please log in again.' });
    }
    next(error);
  }
}
function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'You do not have permission to perform this action.' });
}
module.exports = { requireAuth, requireRole };
