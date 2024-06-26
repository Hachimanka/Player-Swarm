import { Request, Response } from 'express';

export class PlacexchangeService {
    public getCheckup(req: Request, res: Response): void {
        res.send('checkup data');
    }
}
