import { Request, Response, NextFunction } from 'express';
import { CheckupService } from '@services/checkup';
import { sendSuccess, sendError } from '@utils/response';
import logger from '@middlewares/logger';

export class CheckupController {
    private checkupService: CheckupService;

    constructor() {
        this.checkupService = new CheckupService();
        this.getCheckup = this.getCheckup.bind(this);
    }

    /**
     * Handle checkup request
     * @param req Express request object
     * @param res Express response object
     * @param next Express next function
     */
    public async getCheckup(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await this.checkupService.checkHealth();
            sendSuccess(res, result, 'Health check successful');
        } catch (error) {
            logger.error('Checkup controller error:', error);
            next(error);
        }
    }
}
