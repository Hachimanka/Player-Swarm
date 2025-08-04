import { Router } from 'express';
import { VistarController } from '@controllers/vistar';

const router = Router();
const vistarController = new VistarController();

/**
 * GET / - Vistar service status endpoint
 * @route GET /api/vistar
 * @returns {Object} Vistar service status
 */
router.get('/', vistarController.getStatus);

export default router;
