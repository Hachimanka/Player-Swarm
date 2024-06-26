import { Router, Request, Response } from 'express';
import { CheckupService } from './checkup.service';

const CheckupController = Router();

CheckupController.get('/', (req: Request, res: Response) => {
    const _checkup: CheckupService = new CheckupService();
    _checkup.getCheckup(req, res);
});

export default CheckupController;
