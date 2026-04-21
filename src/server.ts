import app from './app';
import logger from '@middlewares/logger';
import { config } from './environments';

app.listen(config.port, () => {
    console.log(`Server is running on http://localhost:${config.port}`);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception thrown:', error);
    process.exit(1);
});
