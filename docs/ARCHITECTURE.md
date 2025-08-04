# Enterprise Architecture Documentation

## 🏗️ Project Structure

This project follows enterprise-level architecture patterns with clear separation of concerns:

```
src/
├── __tests__/          # Test files
├── controllers/        # HTTP request/response handlers
├── middlewares/        # Express middlewares (auth, logging, etc.)
├── routes/            # Route definitions only
├── services/          # Business logic layer
├── types/             # TypeScript type definitions
├── utils/             # Utility functions
├── app.ts             # Express app configuration
└── server.ts          # Server entry point
```

## 🔄 Data Flow Architecture

```
HTTP Request → Route → Controller → Service → Database/External API
                ↓
HTTP Response ← Controller ← Service ← Database/External API
```

## 📁 Layer Responsibilities

### 1. **Routes Layer** (`src/routes/`)
- **Purpose**: Define API endpoints and HTTP methods
- **Responsibilities**: 
  - Route definitions (`GET /api/checkup`)
  - Route-level middleware application
  - Route parameter validation
- **What it should NOT do**: Business logic, database operations, request/response handling

### 2. **Controllers Layer** (`src/controllers/`)
- **Purpose**: Handle HTTP requests and responses
- **Responsibilities**:
  - Parse request data (body, params, query)
  - Call appropriate services
  - Handle service responses
  - Send HTTP responses
  - Handle controller-level errors
- **What it should NOT do**: Business logic, database operations

### 3. **Services Layer** (`src/services/`)
- **Purpose**: Contain business logic
- **Responsibilities**:
  - Business rule implementation
  - Data processing and validation
  - External API calls
  - Database operations
  - Complex calculations
- **What it should NOT do**: HTTP-specific operations, direct request/response handling

### 4. **Middlewares Layer** (`src/middlewares/`)
- **Purpose**: Cross-cutting concerns
- **Responsibilities**:
  - Authentication/Authorization
  - Logging
  - Error handling
  - Request validation
  - Rate limiting

### 5. **Utils Layer** (`src/utils/`)
- **Purpose**: Shared utility functions
- **Responsibilities**:
  - Response formatters
  - Data transformers
  - Helper functions
  - Common validations

## 🎯 Benefits of This Architecture

### ✅ **Separation of Concerns**
- Each layer has a single responsibility
- Easy to understand and maintain
- Clear boundaries between layers

### ✅ **Testability**
- Controllers can be tested independently
- Services can be unit tested without HTTP concerns
- Mock dependencies easily

### ✅ **Scalability**
- Easy to add new features
- Consistent patterns across the application
- Easy to refactor individual layers

### ✅ **Maintainability**
- Clear file organization
- Predictable code location
- Easier debugging and troubleshooting

## 📝 Example Implementation

### Route Definition (`src/routes/checkup/checkup.router.ts`)
```typescript
import { Router } from 'express';
import { CheckupController } from '@controllers/checkup.controller';

const router = Router();
const checkupController = new CheckupController();

router.get('/', checkupController.getCheckup);
export default router;
```

### Controller (`src/controllers/checkup.controller.ts`)
```typescript
export class CheckupController {
  private checkupService: CheckupService;

  public async getCheckup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.checkupService.checkHealth();
      sendSuccess(res, result, 'Health check successful');
    } catch (error) {
      next(error);
    }
  }
}
```

### Service (`src/services/checkup.service.ts`)
```typescript
export class CheckupService {
  public async checkHealth(): Promise<HealthStatus> {
    // Business logic here
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      // ... more health data
    };
  }
}
```

## 🚀 Getting Started

1. **Adding a new endpoint**:
   - Create service in `src/services/`
   - Create controller in `src/controllers/`
   - Add route in `src/routes/`

2. **Path mapping**: Use `@controllers`, `@services`, `@routes` for clean imports

3. **Error handling**: All errors are caught by controllers and passed to error middleware

4. **Response formatting**: Use utility functions from `@utils/response`

This architecture ensures your API is maintainable, testable, and scalable as it grows!
