import { Request, Response, NextFunction } from 'express';
import { PxchangeService } from '@services/pxchange';
import { sendSuccess, sendError } from '@utils/response';
import logger from '@middlewares/logger';

export class PxchangeController {
    private pxchangeService: PxchangeService;

    constructor() {
        this.pxchangeService = new PxchangeService();
        this.getStatus = this.getStatus.bind(this);
    }

    /**
     * Handle pxchange status request
     * @param req Express request object
     * @param res Express response object
     * @param next Express next function
     */
    public async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await this.pxchangeService.getServiceStatus();
            sendSuccess(res, result, 'Pxchange service status retrieved');
        } catch (error) {
            logger.error('Pxchange controller error:', error);
            next(error);
        }
    }
}
