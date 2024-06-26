import express, { Application, Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import logger from './middlewares/logger';

/** Controllers */
import CHECKUP_ROUTER from './routes/checkup';
import PXCHANGE_ROUTER from './routes/pxchange';
import VISTAR_ROUTER from './routes/vistar';

/** Initializers */
dotenv.config();
const app: Application = express();
const PORT = process.env.PORT || 3000;

/** Use helmet to secure Express apps by setting various HTTP headers */
app.use(helmet());

/** Enable CORS with default options */
app.use(cors());

/** Routes */
app.use(express.json());

/** Middleware to log requests
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next middleware function
 */
app.use((req: Request, res: Response, next: NextFunction) => {
    logger.info(`${req.method} ${req.url}`);
    next();
});

/**
 * Route serving checkup controller.
 * @name /api/checkup
 */
app.use('/api/checkup', CHECKUP_ROUTER);

/**
 * Route serving place exchange controller.
 * @name /api/pxchange
 */
app.use('/api/pxchange', PXCHANGE_ROUTER);

/**
 * Route serving vistar controller.
 * @name /api/vistar
 */
app.use('/api/vistar', VISTAR_ROUTER);

/**
 * Error handling middleware.
 * @function
 * @param {Error} err - Error object
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next middleware function
 */
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error(err.message);
    res.status(500).json({ message: err.message });
});

/**
 * Starts the Express server.
 * @function
 */
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
