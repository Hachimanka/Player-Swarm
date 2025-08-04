# TypeScript Express Scaffolding

Enterprise Node.js REST API Server built with TypeScript, Express.js, and modern development practices.

## 🚀 Features

- **TypeScript**: Full TypeScript support with strict type checking
- **Express.js**: Fast, unopinionated web framework
- **Enterprise Architecture**: Modular structure with separation of concerns
- **Security**: Helmet, CORS, rate limiting, and input validation
- **Logging**: Winston logger with daily rotation and structured logging
- **Testing**: Jest testing framework with coverage reporting
- **Code Quality**: ESLint, Prettier, and Husky for code quality
- **Development**: Hot reloading with Nodemon and path mapping

## 📋 Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0

## 🛠 Installation

```bash
# Clone the repository
git clone <repository-url>
cd ts-express-scaffolding

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Install Husky hooks
npm run prepare
```

## 🚀 Getting Started

### Development

```bash
# Start development server with hot reloading
npm run dev
```

### Production

```bash
# Build the application
npm run build

# Start production server
npm start

# Or with production environment
npm run start:prod
```

## 📁 Project Structure

### Clean & Organized Layout

```
├── config/          # 🎛️ Most configuration files
│   ├── eslint.config.js    # ESLint configuration
│   ├── jest.config.js      # Jest testing configuration
│   └── nodemon.json        # Nodemon development configuration
├── docker/          # 🐳 All Docker-related files
│   ├── Dockerfile          # Docker image configuration
│   ├── docker-compose.yml  # Docker Compose setup
│   └── .dockerignore       # Docker ignore patterns
├── docs/            # 📚 All documentation (except README)
│   ├── ARCHITECTURE.md     # Architecture documentation
│   └── QUICKSTART.md       # Quick start guide
├── src/             # 💻 Source code
│   ├── controllers/ # HTTP request/response handlers
│   │   ├── checkup/        # Health check controller
│   │   ├── pxchange/       # PXchange controller
│   │   └── vistar/         # Vistar controller
│   ├── middlewares/ # Express middlewares
│   │   ├── errorHandler.ts # Error handling middleware
│   │   └── logger/         # Logging middleware
│   ├── routes/      # API route definitions
│   │   ├── checkup/        # Health check routes
│   │   ├── pxchange/       # PXchange routes
│   │   ├── vistar/         # Vistar routes
│   │   └── index.ts        # Route aggregation
│   ├── services/    # Business logic layer
│   │   ├── checkup/        # Health check service
│   │   ├── pxchange/       # PXchange service
│   │   └── vistar/         # Vistar service
│   ├── types/       # TypeScript type definitions
│   │   └── common.ts       # Common interfaces
│   ├── utils/       # Utility functions
│   │   └── response.ts     # Response helpers
│   ├── app.ts       # Express app configuration
│   └── server.ts    # Server entry point
├── scripts/         # 📜 Build/deployment scripts (future)
├── .vscode/         # 🔧 VS Code workspace settings
├── tsconfig.json    # ⚙️ TypeScript configuration (needed in root for IDE)
├── logs/            # 📋 Application logs (auto-generated)
└── dist/            # 🏗️ Compiled output (auto-generated)
```

### Benefits of This Structure

- **🧹 Clean Root**: Only essential files at root level
- **🔍 Easy Navigation**: Related files grouped logically
- **🛠️ Better Maintenance**: Know exactly where to find/add files
- **👥 Team-Friendly**: New developers understand structure quickly
- **📦 Scalable**: Easy to add new features following patterns

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## 📝 Code Quality

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Validate code (lint + test)
npm run validate
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
NODE_ENV=development
PORT=3000
# Add other environment variables as needed
```

### Path Mapping

The project uses TypeScript path mapping for cleaner imports:

- `@/*` - src/*
- `@config/*` - src/config/*
- `@controllers/*` - src/controllers/*
- `@middlewares/*` - src/middlewares/*
- `@models/*` - src/models/*
- `@routes/*` - src/routes/*
- `@services/*` - src/services/*
- `@utils/*` - src/utils/*
- `@types/*` - src/types/*

## 📚 API Documentation

### Available Endpoints

- `GET /api/checkup` - Health check endpoint
- `GET /api/pxchange` - Place exchange endpoints
- `GET /api/vistar` - Vistar endpoints

## 🔒 Security Features

- **Helmet**: Sets security-related HTTP headers
- **CORS**: Configurable cross-origin resource sharing
- **Rate Limiting**: Prevents abuse with configurable limits
- **Input Validation**: Joi schema validation
- **Error Handling**: Centralized error handling with logging

## 📊 Monitoring & Logging

- **Winston Logger**: Structured logging with daily rotation
- **Morgan**: HTTP request logging
- **Error Tracking**: Comprehensive error logging and handling

## 🐳 Running with Docker (Optional)

For developers who prefer containerized development:

### Quick Start with Docker

```bash
# Build and run with Docker (from root directory)
docker build -f docker/Dockerfile -t ts-express-scaffolding .
docker run -p 3000:3000 ts-express-scaffolding
```

### Using Docker Compose

```bash
# Start the application (from root directory)
docker-compose -f docker/docker-compose.yml up

# Run in background
docker-compose -f docker/docker-compose.yml up -d

# Stop the application
docker-compose -f docker/docker-compose.yml down
```

All Docker files are organized in the `docker/` folder for better project structure.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.
