import jwt from 'jsonwebtoken';
export function signToken(user) {
  return jwt.sign({ sub: user.id, id: user.id, role: user.role, name: user.name, email: user.email, communityId: user.community_id || user.communityId },
    process.env.JWT_SECRET || 'local-development-secret-change-me', { expiresIn: '12h' });
}
export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'local-development-secret-change-me');
    req.user.id = req.user.id || req.user.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
  next();
};
