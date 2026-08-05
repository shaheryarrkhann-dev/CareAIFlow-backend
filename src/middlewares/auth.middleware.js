const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
const authenticate = (required = true) => {
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token && required) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!token && !required) {
      return next();
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      
      // Verify user still exists and is active
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        include: { 
          tenant: true
        }
      });

      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'User not found or inactive'
        });
      }

      // If user is not SUPER_ADMIN, verify tenant access
      if (user.role !== 'SUPER_ADMIN') {
        // User must have a tenant
        if (!user.tenantId) {
          return res.status(401).json({
            success: false,
            message: 'User is not associated with any organization'
          });
        }
        
        // Verify tenant is active
        if (user.tenant && !user.tenant.isActive) {
          return res.status(401).json({
            success: false,
            message: 'Organization is inactive'
          });
        }
      }

      // Attach user info to request (use DB user.tenantId/role when payload missing so permission resolution works)
      req.user = {
        id: payload.sub,
        name: user.name,
        email: payload.email,
        role: payload.role ?? user.role,
        tenantId: payload.tenantId ?? user.tenantId ?? null
      };

      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired'
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
  };
};

module.exports = authenticate;
