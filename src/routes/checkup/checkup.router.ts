import { Router } from 'express';
import { CheckupController } from '@controllers/checkup';

const router = Router();
const checkupController = new CheckupController();

/**
 * GET / - Health check endpoint
 * @route GET /api/checkup
 * @returns {Object} Health status information
 */
router.get('/', checkupController.getCheckup);

export default router;
