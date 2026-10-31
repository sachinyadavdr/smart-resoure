import jwt from 'jsonwebtoken';

const secret = () => process.env.JWT_SECRET || 'development-only-secret-change-me';
export function createToken(user) { return jwt.sign({ sub: user.id, role: user.role, email: user.email }, secret(), { expiresIn: '2h' }); }
export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  try { req.user = jwt.verify(token, secret()); next(); } catch { return res.status(401).json({ error: 'Invalid or expired token.' }); }
}
export function allowRoles(...roles) { return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Insufficient permissions.' }); }
