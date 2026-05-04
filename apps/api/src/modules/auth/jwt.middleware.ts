import { Request, Response, NextFunction } from 'express';
import { verifyJwt } from './auth.service';

declare global {
  namespace Express {
    interface Request {
      wallet?: string;
    }
  }
}

export function jwtMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authorization header required' });
    return;
  }

  const token = authHeader.slice(7);

  if (!token) {
    res.status(401).json({ success: false, error: 'Token required' });
    return;
  }

  const payload = verifyJwt(token);

  if (!payload) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }

  req.wallet = payload.wallet;
  next();
}
