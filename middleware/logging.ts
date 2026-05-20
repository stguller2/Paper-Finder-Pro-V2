import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';

// Extend Express Request type to include id
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req.headers['x-request-id'] || uuidv4()) as string,
  customProps: (req) => ({
    request_id: req.id,
  }),
});

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const reqId = (req.headers['x-request-id'] || uuidv4()) as string;
  req.id = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
};
