import { Router } from 'express';
import checkupRouter from './checkup/checkup.router';
import pxchangeRouter from './pxchange/pxchange.router';
import vistarRouter from './vistar/vistar.router';

const router = Router();

router.use('/checkup', checkupRouter);
router.use('/pxchange', pxchangeRouter);
router.use('/vistar', vistarRouter);

export default router;
