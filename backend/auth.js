import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password_hash: { type: String, required: true },
  role: { type: String, enum: ['ADMIN', 'SENIOR_INVESTIGATOR', 'ANALYST'], default: 'ADMIN' },
  display_name: { type: String, default: 'Investigator' },
  badge_id: { type: String, default: 'TX-OFFICER-01' },
  created_at: { type: String, default: () => new Date().toISOString() },
  last_login: String
}, { collection: 'users' });

export const User = mongoose.models.User || mongoose.model('User', userSchema);

const loginAttempts = new Map(); // ip_email -> { count, lockedUntil }

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

function getAttemptKey(email, ip) {
  return `${String(ip || '0.0.0.0')}_${String(email || '').toLowerCase().trim()}`;
}

export function checkRateLimit(email, ip) {
  const key = getAttemptKey(email, ip);
  const record = loginAttempts.get(key);
  if (!record) return { allowed: true };
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remainingSeconds = Math.ceil((record.lockedUntil - Date.now()) / 1000);
    return {
      allowed: false,
      message: `Too many failed attempts. Access locked for ${remainingSeconds} seconds.`
    };
  }
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    loginAttempts.delete(key);
    return { allowed: true };
  }
  return { allowed: true };
}

export function recordFailedAttempt(email, ip) {
  const key = getAttemptKey(email, ip);
  const now = Date.now();
  const record = loginAttempts.get(key) || { count: 0, firstAttempt: now };
  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
  }
  loginAttempts.set(key, record);
}

export function clearFailedAttempts(email, ip) {
  loginAttempts.delete(getAttemptKey(email, ip));
}

export async function seedAdminUser() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'jakkulaayushpreetham@gmail.com').toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD || 'ayush2006';

  try {
    const existing = await User.findOne({ email: adminEmail });
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(adminPassword, salt);

    if (!existing) {
      await User.create({
        email: adminEmail,
        password_hash: hash,
        role: 'ADMIN',
        display_name: 'Dr. J. PremaSagar',
        badge_id: 'TX-INV-001',
        last_login: null
      });
      console.log(`[Auth] Seeded admin user: ${adminEmail}`);
    } else {
      // Keep password updated from environment
      existing.password_hash = hash;
      await existing.save();
    }
  } catch (err) {
    console.error('[Auth] Error seeding admin user:', err.message);
  }
}

export async function authenticateUser(email, password, ip) {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const rateLimit = checkRateLimit(normalizedEmail, ip);
  if (!rateLimit.allowed) {
    const err = new Error(rateLimit.message);
    err.status = 429;
    err.code = 'rate_limited';
    throw err;
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    recordFailedAttempt(normalizedEmail, ip);
    const err = new Error('Invalid email or password');
    err.status = 401;
    err.code = 'invalid_credentials';
    throw err;
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    recordFailedAttempt(normalizedEmail, ip);
    const err = new Error('Invalid email or password');
    err.status = 401;
    err.code = 'invalid_credentials';
    throw err;
  }

  clearFailedAttempts(normalizedEmail, ip);
  user.last_login = new Date().toISOString();
  await user.save();

  const secret = process.env.JWT_SECRET || 'tracex_secret_jwt_key_sih26183_secure_auth';
  const token = jwt.sign(
    {
      id: String(user._id),
      email: user.email,
      role: user.role,
      display_name: user.display_name,
      badge_id: user.badge_id
    },
    secret,
    { expiresIn: '24h' }
  );

  return {
    token,
    user: {
      id: String(user._id),
      email: user.email,
      role: user.role,
      display_name: user.display_name,
      badge_id: user.badge_id,
      last_login: user.last_login
    }
  };
}

export function authMiddleware(req, res, next) {
  // Allow OPTIONS preflight
  if (req.method === 'OPTIONS') return next();

  // Allow public routes
  const publicPaths = [
    '/api/auth/login',
    '/api/config',
    '/api/docs'
  ];

  if (publicPaths.some(p => req.path === p || req.path.startsWith('/api/docs'))) {
    return next();
  }

  // Check Bearer token or cookie
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required. Access to this law enforcement workspace requires valid credentials.',
      code: 'auth_required'
    });
  }

  const secret = process.env.JWT_SECRET || 'tracex_secret_jwt_key_sih26183_secure_auth';
  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      error: err.name === 'TokenExpiredError' ? 'Session expired. Please log in again.' : 'Invalid authentication token.',
      code: 'invalid_token'
    });
  }
}
