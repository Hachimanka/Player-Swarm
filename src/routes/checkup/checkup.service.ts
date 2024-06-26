import { Request, Response } from 'express';
import { ResponsePayload } from '../../interfaces';

/**
 * Service for handling checkup operations.
 */
export class CheckupService {
    /**
     * Handles the checkup request and sends a response indicating the service status.
     *
     * @param {Request} req - The Express request object.
     * @param {Response} res - The Express response object.
     * @returns {void}
     */
    public getCheckup(req: Request, res: Response): void {
        const data: ResponsePayload = new ResponsePayload('success', { checkup: 'up and running' });
        res.status(200).send(data);
    }
}
