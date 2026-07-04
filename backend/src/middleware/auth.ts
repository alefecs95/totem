import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AdminPayload {
  id: string;
  email: string;
  role: 'admin';
}

export interface PortalPayload {
  tenantId: string;
  email: string;
  nome: string;
  role: 'portal';
}

type JwtPayload = AdminPayload | PortalPayload | (Record<string, unknown> & { role?: string });

export interface AuthRequest extends Request {
  admin?: AdminPayload;
  portal?: PortalPayload;
}

function getBearerToken(req: Request): string | null {
  const header = req.header('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

// Valida o JWT do painel admin no header Authorization: Bearer {token}.
export function verifyAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwt.secret) as JwtPayload;
    if (payload.role === 'portal') {
      res.status(401).json({ error: 'invalid_token' });
      return;
    }
    const admin = payload as AdminPayload;
    req.admin = { id: admin.id, email: admin.email, role: 'admin' };
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

// Valida o JWT do portal do organizador (dono do totem locado).
export function verifyPortal(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwt.secret) as JwtPayload;
    if (payload.role !== 'portal' || !('tenantId' in payload)) {
      res.status(401).json({ error: 'invalid_token' });
      return;
    }
    const portal = payload as PortalPayload;
    req.portal = {
      tenantId: portal.tenantId,
      email: portal.email,
      nome: portal.nome,
      role: 'portal',
    };
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}
