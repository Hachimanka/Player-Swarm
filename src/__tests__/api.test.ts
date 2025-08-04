import request from 'supertest';
import express from 'express';
import routes from '@routes/index';

const app = express();
app.use(express.json());
app.use('/api', routes);

describe('API Endpoints', () => {
    describe('GET /api/checkup', () => {
        it('should return 200 status', async () => {
            const response = await request(app).get('/api/checkup').expect('Content-Type', /json/);

            expect(response.status).toBe(200);
        });
    });

    describe('GET /api/pxchange', () => {
        it('should return 200 status', async () => {
            const response = await request(app).get('/api/pxchange').expect('Content-Type', /json/);

            expect(response.status).toBe(200);
        });
    });

    describe('GET /api/vistar', () => {
        it('should return 200 status', async () => {
            const response = await request(app).get('/api/vistar').expect('Content-Type', /json/);

            expect(response.status).toBe(200);
        });
    });
});
