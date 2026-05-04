import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export interface ApiResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

export function successResponse(data?: unknown): ApiResponse {
  return { success: true, data };
}

export function errorResponse(error: string): ApiResponse {
  return { success: false, error };
}

export function sendResponse(res: Response, statusCode: number, data: ApiResponse): void {
  res.status(statusCode).json(data);
}

export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('Error:', err);

  if (err instanceof ZodError) {
    sendResponse(res, 400, errorResponse(err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')));
    return;
  }

  if (err instanceof jwt.JsonWebTokenError) {
    sendResponse(res, 401, errorResponse('Invalid token'));
    return;
  }

  if (err instanceof jwt.TokenExpiredError) {
    sendResponse(res, 401, errorResponse('Token expired'));
    return;
  }

  const statusCode = (err as { statusCode?: number }).statusCode || 500;
  sendResponse(res, statusCode, errorResponse(process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message));
}
