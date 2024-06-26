import { Router, Request, Response } from 'express';

const PlaceXchange = Router();

PlaceXchange.get('/', (req: Request, res: Response) => {
    res.send('Hello, PXChange!');
});

export default PlaceXchange;
