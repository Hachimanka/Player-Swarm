import 'dotenv/config';

/** All environment-based configuration for the application. */
export const config = {
    port: Number(process.env.PORT ?? 3000),
};

/** Throws if any required env vars are missing. Call this before starting jobs or external calls. */
export function assertRuntimeConfig(): void {
    const required = [
        // Add required env var names here, e.g. 'DATABASE_URL'
    ] as const;

    const missing = required.filter((name) => !process.env[name]);
    if (missing.length > 0) {
        throw new Error(`Missing required env vars: ${missing.join(', ')}`);
    }
}
