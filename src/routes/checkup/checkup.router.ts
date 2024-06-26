import { Router, Request, Response, NextFunction } from 'express';
import logger from '../../middlewares/logger';

/** Services */
import { CheckupService } from './checkup.service';

/** Route initialization */
const CHECKUP_ROUTER = Router();

/**
 * GET / - Handler for the root path of the CHECKUP_ROUTER.
 *
 * This route serves the checkup service.
 *
 * @function
 * @async
 * @param {Request} req - The Express request object.
 * @param {Response} res - The Express response object.
 * @param {NextFunction} next - The Express next middleware function.
 * @returns {Promise<void>}
 */
CHECKUP_ROUTER.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const _checkup: CheckupService = new CheckupService();
        _checkup.getCheckup(req, res);
    } catch (err) {
        logger.error(`CHECKUP_ROUTER Error: ${err}`);
        next(err);
    }
});

export default CHECKUP_ROUTER;
