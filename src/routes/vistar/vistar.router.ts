/** Global Imports and middlewares */
import { Router, Request, Response, NextFunction } from 'express';
import logger from '../../middlewares/logger';

/** Services */
import { VistarService } from './vistar.service';

/** Route initialization  */
const VISTAR_ROUTER = Router();

/**
 * GET / - Handler for the root path of the VISTAR_ROUTER.
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
VISTAR_ROUTER.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const _pxchange: VistarService = new VistarService();
        await _pxchange.getCheckup(req, res);
    } catch (err) {
        logger.error(`VISTAR Error: ${err}`);
        next(err);
    }
});

export default VISTAR_ROUTER;
