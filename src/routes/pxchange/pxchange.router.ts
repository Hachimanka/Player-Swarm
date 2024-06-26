/** Global Imports and middlewares */
import { Router, Request, Response, NextFunction } from 'express';
import logger from '../../middlewares/logger';

/** Services */
import { PXchangeService } from './pxchange.service';

/** Route initialization  */
const PXCHANGE_ROUTER = Router();

/**
 * GET / - Handler for the root path of the PXCHANGE_ROUTER.
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
PXCHANGE_ROUTER.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const _pxchange: PXchangeService = new PXchangeService();
        await _pxchange.getCheckup(req, res);
    } catch (err) {
        logger.error(`PXCHANGE_ROUTER Error: ${err}`);
        next(err);
    }
});

export default PXCHANGE_ROUTER;
