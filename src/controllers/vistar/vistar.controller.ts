import { Request, Response, NextFunction } from 'express';
import { VistarService } from '@services/vistar';
import { sendSuccess, sendError } from '@utils/response';
import logger from '@middlewares/logger';

export class VistarController {
    private vistarService: VistarService;

    constructor() {
        this.vistarService = new VistarService();
        this.getStatus = this.getStatus.bind(this);
    }

    /**
     * Handle vistar status request
     * @param req Express request object
     * @param res Express response object
     * @param next Express next function
     */
    public async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await this.vistarService.getServiceStatus();
            sendSuccess(res, result, 'Vistar service status retrieved');
        } catch (error) {
            logger.error('Vistar controller error:', error);
            next(error);
        }
    }
}
