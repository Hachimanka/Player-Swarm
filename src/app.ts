import express, { Application } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import errorHandlerMiddleware from '@middlewares/errorHandler';
import logger from '@middlewares/logger';

import routes from '@routes/index';

dotenv.config();
const app: Application = express();
const PORT = process.env.PORT || 3000;

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

// Use Routes
app.use('/api', routes);

// Error Handler
app.use(errorHandlerMiddleware);

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
