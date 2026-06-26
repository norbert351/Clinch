import { ParsedQs } from 'qs';
import { ParamsDictionary } from 'express-serve-static-core';

declare global {
  namespace Express {
    interface Request {
      wallet?: string;
    }
  }
}

export {};
