import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import errorHandlerMiddleware from '@middlewares/errorHandler';
import logger from '@middlewares/logger';
import path from 'node:path';

import routes from '@routes/index';

const app: Application = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(morgan('combined', { stream: (logger as any).stream }));

// Rate Limiting
app.use(
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
    }),
);

// JSON Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(process.cwd(), 'public')));

app.get('/health', (_req, res) => {
    res.json({ ok: true });
});

// Use Routes
app.use('/api', routes);

// Error Handler
app.use(errorHandlerMiddleware);

export default app;
