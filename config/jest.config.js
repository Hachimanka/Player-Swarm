module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/../src'],
    testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
    transform: {
        '^.+\\.ts$': 'ts-jest',
    },
    collectCoverageFrom: ['../src/**/*.ts', '!../src/**/*.d.ts', '!../src/server.ts'],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/../src/$1',
        '^@config/(.*)$': '<rootDir>/../src/config/$1',
        '^@controllers/(.*)$': '<rootDir>/../src/controllers/$1',
        '^@middlewares/(.*)$': '<rootDir>/../src/middlewares/$1',
        '^@models/(.*)$': '<rootDir>/../src/models/$1',
        '^@routes/(.*)$': '<rootDir>/../src/routes/$1',
        '^@services/(.*)$': '<rootDir>/../src/services/$1',
        '^@utils/(.*)$': '<rootDir>/../src/utils/$1',
        '^@types/(.*)$': '<rootDir>/../src/types/$1',
    },
};
