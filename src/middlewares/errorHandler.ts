import { Request, Response, NextFunction } from 'express';
import logger from '@middlewares/logger';

interface CustomError extends Error {
    statusCode?: number;
    isOperational?: boolean;
}

const errorHandler = (err: CustomError, req: Request, res: Response, next: NextFunction): void => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    logger.error({
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        statusCode,
    });

    // Don't expose stack traces in production
    const response: any = {
        status: 'error',
        statusCode,
        message,
    };

    if (process.env.NODE_ENV === 'development') {
        response.stack = err.stack;
    }

    res.status(statusCode).json(response);
};

export default errorHandler;
