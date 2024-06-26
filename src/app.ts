import express, { Application, Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';

dotenv.config();

/** Middlewares */
import logger from './middlewares/logger'; // Import the logger

/** Controllers */
import CheckupController from './controllers/checkup';
import PlaceXchange from './controllers/placexchange';

/** Initializers */
const app: Application = express();
const PORT = process.env.PORT || 3000;

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
app.use('/api/checkup', CheckupController);

/**
 * Route serving place exchange controller.
 * @name /api/pxchange
 */
app.use('/api/pxchange', PlaceXchange);

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
