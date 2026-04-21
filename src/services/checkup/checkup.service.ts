export interface HealthStatus {
    status: string;
    timestamp: string;
    uptime: number;
    memory: {
        used: number;
        total: number;
    };
    version: string;
}

export class CheckupService {
    /**
     * Check application health status
     * @returns Promise<HealthStatus>
     */
    public async checkHealth(): Promise<HealthStatus> {
        const memoryUsage = process.memoryUsage();

        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: {
                used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
                total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
            },
            version: process.env.npm_package_version || '1.0.0',
        };
    }
}
