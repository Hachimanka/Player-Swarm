import 'module-alias/register';
import './app';
import logger from '@middlewares/logger';

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception thrown:', error);
    process.exit(1);
});
