# Quick Start Guide

## 🚀 Get Started in 2 Minutes

### Option 1: Node.js Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Server runs on http://localhost:3000
```

### Option 2: Docker Development
```bash
# Build and run with Docker
docker build -f docker/Dockerfile -t ts-express-scaffolding .
docker run -p 3000:3000 ts-express-scaffolding

# Or use Docker Compose
docker-compose -f docker/docker-compose.yml up
```

## 🧪 Test Your Setup

Visit these endpoints to verify everything works:

- **Health Check**: http://localhost:3000/api/checkup
- **PXchange**: http://localhost:3000/api/pxchange  
- **Vistar**: http://localhost:3000/api/vistar

## 📝 Available Scripts

- `npm run dev` - Development with hot reload
- `npm run build` - Build for production
- `npm start` - Run production build
- `npm test` - Run tests
- `npm run lint` - Check code quality

## 🔧 Environment Setup

Copy `.env.example` to `.env` and modify as needed:

```bash
cp .env.example .env
```

That's it! You're ready to build your REST API! 🎉
