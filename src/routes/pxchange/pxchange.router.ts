import { Router } from 'express';
import { PxchangeController } from '@controllers/pxchange';

const router = Router();
const pxchangeController = new PxchangeController();

/**
 * GET / - PXchange service status endpoint
 * @route GET /api/pxchange
 * @returns {Object} PXchange service status
 */
router.get('/', pxchangeController.getStatus);

export default router;
