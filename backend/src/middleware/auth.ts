import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AdminPayload {
  id: string;
  email: string;
}

export interface AuthRequest extends Request {
  admin?: AdminPayload;
}

// Valida o JWT do painel admin no header Authorization: Bearer {token}.
export function verifyAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwt.secret) as AdminPayload;
    req.admin = { id: payload.id, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}
