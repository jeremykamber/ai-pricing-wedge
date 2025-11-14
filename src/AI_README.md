🧭 Hexagonal MVP Architecture Guide (Strict Edition)

Overview

This project follows a strict, domain-first Hexagonal Architecture — designed for scalability, maintainability, and AI-friendly automation.

The architecture enforces four isolated layers, each with a single purpose and zero circular dependencies.

src/
├── domain/           # Business rules, entities, and ports/ports (pure logic)
├── application/      # Use cases that coordinate domain logic
├── infrastructure/   # External implementations; services (API abstractions) and adapters (e.g. repositories) (DBs, APIs, frameworks)
└── ui/               # Framework-bound UI, stores, and components

Layer Responsibilities

🧩 1. Domain Layer (src/domain)
	•	Contains Entities, Value Objects, and Ports (these are TS interfaces, but call them "Ports" for naming convention).
	•	Never imports from other layers.
	•	Purely represents business rules, not implementation.
	•	Example:
	•	entities/User.ts → defines structure and invariants for a user.
	•	ports/UserRepositoryPort.ts → defines contract for saving/fetching users.
	•	ports/DBServicePort.ts → defines contract for all database service implementations.

⚙️ 2. Application Layer (src/application)
	•	Contains Use Cases that orchestrate entities and ports.
	•	Does not know or care about infrastructure details.
	•	Example:
	•	usecases/RegisterUserUseCase.ts → uses UserRepositoryPort to persist a User entity.
	•	Use cases depend only on domain interfaces, never concrete adapters.

🧱 3. Infrastructure Layer (src/infrastructure)
	•	Contains Adapters that implement domain ports using real-world tools (e.g. Supabase, Firebase, HTTP APIs).
	•	A good rule to diff. betw. services and adapters is when there are multiple adapters doing the same thing, that could be swapped out from one another, and they're just an abstraction of an API, those are services. Otherwise, they are adapters. Adapters also generally have one port to itself. Once multiple adapters share a port, those are services. 
	•	Example:
	•	services/SupabaseServiceImpl.ts → implements DBServicePort with Supabase SDK calls.
	•	services/MongoDBServiceImpl.ts → implements DBServicePort with MongoDB calls (e.g. you wanted to migrate the codebase from Supabase to MongoDB).
	•	adapters/UserRepositoryImpl.ts → implements UserRepositoryPort with Supabase SDK calls.
	•	In this example, let's say you wanted to migrate the codebase from Supabase to MongoDB. All you'd have to do is change which of the service implementations you use when instantiating the repository. Since all DB service implementations follow the DB service port contract, you don't have to change ANY CODE in the repository; you just change what gets passed in on instantiation (generally done in a store).
	•	Never contain business logic — only translation between external APIs and domain models.

🎨 4. UI Layer (src/ui)
	•	Framework-dependent layer.
	•	Divided into:
	•	stores/ → Zustand stores exposing use cases to components.
	•	components/ → React/Next.js UI components consuming stores.
	•	UI never directly talks to infrastructure or domain.
	•	Components should only:
	1.	Render data
	2.	Trigger store actions

⸻

🔄 Communication Flow

UI (React Components)
     ↓
Zustand Store (State + Actions)
     ↓
Application (Use Cases)
     ↓
Domain (Entities + Ports)
     ↓
Infrastructure (Adapters implementing Ports)

Each arrow points one direction only — no circular dependencies.

⸻

🧱 Core Principles
	1.	Domain is King — All business logic lives in the domain layer.
	2.	Dependency Inversion — Upper layers depend on interfaces, not implementations.
	3.	Replaceability — You can swap Supabase for Firebase or any API adapter with zero domain or application changes.
	4.	Testability — Use cases are fully testable in isolation by mocking ports.
	5.	UI Dumbness — The UI knows nothing about logic; it just renders state and triggers actions.

⸻

🚀 Feature Development Workflow

When adding a new feature (e.g., RegisterUser):
	1.	Define Entities in domain/entities/.
	•	Example: User.ts defines User structure and validation helpers.
	2.	Define Ports (interfaces) in domain/ports/.
	•	Example: UserRepositoryPort.ts defines how the app expects persistence to work.
	3.	Implement Use Case in application/usecases/.
	•	Example: RegisterUserUseCase.ts orchestrates entity creation and calls the port.
	4.	Implement Adapter in infrastructure/adapters/.
	•	Example: UserRepositoryImpl.ts depends on a DB service to satisfy the port contract.
	4.5 Implement Services in infrastructure/services/.
	•	Example: SupabaseServiceImpl.ts and MongoDBServiceImpl.ts are interchangeable, both implement the DBServicePort, and are used in UserRepositoryImpl.
	5.	Create Store in ui/stores/.
	•	Exposes the use case to UI components; instantiates the required adapters and usecases; handles loading/error states.
	6.	Create Component in ui/components/.
	•	Renders the store’s state, triggers store actions (no logic).
	7.	Write Tests in application/usecases/__tests__/.
	•	Test your use case logic using mocked adapters.

⸻

⚖️ Rules for AI Agents (and Humans)

✅ You can
	•	Add new entities, use cases, ports, adapters, services, or UI stores/components.
	•	Use existing Plop generators to scaffold consistent files (bunx plop `adapter/usecase/component/store/port/entity` `name (e.g. "User", "RegisterUser")`).
	•	Create new adapters to connect to APIs or services.
	•	Add framework utilities inside infrastructure/utils/ if needed.

❌ You must not
	•	Add business logic to:
	•	UI components
	•	Zustand stores
	•	Adapters
	•	Reference infrastructure or UI code from domain or application layers.
	•	Modify existing use cases or entities to handle framework-specific concerns.

⚠️ When in doubt:

Ask:

“Would this logic still make sense if I replaced React or Supabase?”
If yes, it belongs in the domain or application layer.
If no, it belongs in infrastructure or UI.

⸻

🧰 Tools at Your Disposal
	•	React / Next.js — Framework for the UI layer.
	•	Zustand — For state management and bridging UI ↔ application layers.
	•	Bun — Runtime & package manager (use bun add to install).
	•	shadcn/ui — Prebuilt, composable UI components.

⸻

---

## ShadCN UI Component Usage Note

Add new components from the shad cn registry with:

bunx --bun shadcn@latest add <component_name>


They are automatically placed under @/components/ui.

When using shadcn/ui components, do **not** use property access (e.g., `<Dialog.Content>`, `<Dialog.Header>`, etc.). Instead, import each subcomponent directly and use them as named components:

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// Usage:
<Dialog open={open} onOpenChange={handleClose}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
    <DialogDescription>
      {/* content */}
    </DialogDescription>
    <DialogFooter>
      {/* actions */}
    </DialogFooter>
  </DialogContent>
</Dialog>
```

This ensures compatibility with shadcn/ui and avoids runtime/type errors. Always import dialog subcomponents directly and use them as shown above.

---

🧪 Testing Strategy
	•	Unit test entities and use cases only.
	•	Mock out adapters when testing use cases.
	•	Avoid testing UI logic here — that’s for integration tests.

⸻

🧭 Summary for Automation

Layer	Folder	Purpose	Knows About	Example File
Domain	src/domain	Business rules & contracts	Nothing	User.ts, UserRepositoryPort.ts
Application	src/application	Orchestrates domain logic	Domain	RegisterUserUseCase.ts
Infrastructure	src/infrastructure	Implements ports using tech	Domain	UserRepositoryImpl.ts
UI	src/ui	Framework-bound view layer	Application	userStore.ts, RegisterUserComponent.tsx


--- 

Here's an example of this in action:

***

## Project Folder Structure



src/
├── domain/
│   ├── dtos/ (optional)
│   │   └── UserDTO.ts                  # Data Transfer Object (optional unless transporting across layers (through DBs or whatever)) representing User data across layers
│   ├── entities/
│   │   └── User.ts                    # Core domain User entity and business rules
│   ├── ports/
│   │   ├── UserRepositoryPort.ts      # Port interface defining methods for user persistence
│   │   └── DatabaseServicePort.ts     # Generic DB service port defining CRUD operations
├── application/
│   └── usecases/
│       └── RegisterUserUseCase.ts     # Application use case for user registration
├── infrastructure/
│   ├── adapters/
│   │   └── UserRepositoryImpl.ts      # UserRepo adapter implementing UserRepositoryPort, delegates to DatabaseServicePort
│   └── services/
│       ├── SupabaseService.ts         # Concrete DB service adapter implementing DatabaseServicePort via Supabase SDK
│       └── FirebaseService.ts         # Optional alternative DB service implementation for Firebase
├── ui/
│   ├── stores/
│   │   └── userStore.ts               # Zustand store managing UI state & calling use cases
│   └── components/
│       └── RegisterUserComponent.tsx  # React UI component consuming Zustand store state & actions
```

***

## Domain Layer

### dtos/UserDTO.ts

```typescript
export interface UserDTO {
  id: string;
  email: string;
  password: string; // plaintext only at DTO level, domain entity stores hashed password
}
```

### entities/User.ts

```typescript
export class User {
  constructor(
    public readonly id: string,
    public readonly email: string,
    private readonly passwordHash: string
  ) {}

  static fromDTO(dto: { id: string; email: string; password: string }): User {
    const passwordHash = User.hashPassword(dto.password);
    return new User(dto.id, dto.email, passwordHash);
  }

  static hashPassword(password: string): string {
    // Simple hash example
    return password.split('').reverse().join('');
  }

  validateEmail(): boolean {
    return this.email.includes('@');
  }

  getPasswordHash(): string {
    return this.passwordHash;
  }
}
```

### interfaces/UserRepositoryPort.ts

```typescript
import { User } from '../entities/User';

export interface UserRepositoryPort {
  saveUser(user: User): Promise<void>;
}
```

### interfaces/DatabaseServicePort.ts

```typescript
export interface DatabaseServicePort {
  insert(table: string, data: any): Promise<void>;
  update(table: string, id: string, data: any): Promise<void>;
  find(table: string, id: string): Promise<any>;
  delete(table: string, id: string): Promise<void>;
}
```

***

## Application Layer

### usecases/RegisterUserUseCase.ts

```typescript
import { UserRepositoryPort } from '../../domain/ports/UserRepositoryPort';
import { UserDTO } from '../../domain/dtos/UserDTO';
import { User } from '../../domain/entities/User';

export class RegisterUserUseCase {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async execute(userDTO: UserDTO): Promise<void> {
    if (!userDTO.email.includes('@')) {
      throw new Error('Invalid email');
    }
    const user = User.fromDTO(userDTO);
    if (!user.validateEmail()) {
      throw new Error('Invalid email (entity validation)');
    }
    await this.userRepository.saveUser(user);
  }
}
```

***

## Infrastructure Layer

### services/SupabaseService.ts

```typescript
import { DatabaseServicePort } from '../../domain/ports/DatabaseServicePort';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('your_supabase_url', 'your_public_anon_key');

export class SupabaseService implements DatabaseServicePort {
  async insert(table: string, data: any): Promise<void> {
    const { error } = await supabase.from(table).insert(data);
    if (error) throw error;
  }

  async update(table: string, id: string, data: any): Promise<void> {
    const { error } = await supabase.from(table).update(data).eq('id', id);
    if (error) throw error;
  }

  async find(table: string, id: string): Promise<any> {
    const { data, error } = await supabase.from(table).select('*').eq('id', id);
    if (error) throw error;
    return data ? data[0] : null;
  }

  async delete(table: string, id: string): Promise<void> {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw error;
  }
}
```

### adapters/UserRepositoryImpl.ts

```typescript
import { UserRepositoryPort } from '../../domain/ports/UserRepositoryPort';
import { User } from '../../domain/entities/User';
import { DatabaseServicePort } from '../../domain/ports/DatabaseServicePort';

export class UserRepositoryImpl implements UserRepositoryPort {
  constructor(private readonly databaseService: DatabaseServicePort) {}

  async saveUser(user: User): Promise<void> {
    const dbUser = {
      id: user.id,
      email: user.email,
      password_hash: user.getPasswordHash(),
    };
    await this.databaseService.insert('users', dbUser);
  }
}
```

***

## UI Layer

### stores/userStore.ts (Zustand store)

```typescript
import { create } from 'zustand';
import { RegisterUserUseCase } from '../../application/usecases/RegisterUserUseCase';
import { UserRepositoryImpl } from '../../infrastructure/adapters/UserRepositoryImpl';
import { SupabaseService } from '../../infrastructure/services/SupabaseService';
import { UserDTO } from '../../domain/dtos/UserDTO';

const supabaseService = new SupabaseService();
const userRepository = new UserRepositoryImpl(supabaseService);
const registerUserUseCase = new RegisterUserUseCase(userRepository);

interface UserState {
  loading: boolean;
  error: string | null;
  registerUser: (user: UserDTO) => Promise<void>;
}

export const useUserStore = create<UserState>((set) => ({
  loading: false,
  error: null,
  registerUser: async (user) => {
    set({ loading: true, error: null });
    try {
      await registerUserUseCase.execute(user);
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ loading: false });
    }
  },
}));
```

### components/RegisterUserComponent.tsx (React)

```tsx
import React from 'react';
import { useUserStore } from '../stores/userStore';

export const RegisterUserComponent: React.FC = () => {
  const { loading, error, registerUser } = useUserStore();

  const handleClick = () => {
    registerUser({
      id: '123',
      email: 'test@example.com',
      password: 'password123',
    });
  };

  return (
    <>
      <button onClick={handleClick} disabled={loading}>
        Register
      </button>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </>
  );
};
```

***

## Summary

- **Domain Layer:** Contains `User` entity with validation and a `UserDTO` for cross-layer data transfer.
- **Ports:** `UserRepositoryPort` defines user persistence operations; `DatabaseServicePort` defines generic DB CRUD actions.
- **Application Layer:** `RegisterUserUseCase` coordinates validation and user saving using the repository port.
- **Infrastructure Layer:** 
  - `SupabaseService` implements generic `DatabaseServicePort` wrapping Supabase SDK.
  - `UserRepositoryImpl` implements `UserRepositoryPort`, delegating DB ops to `SupabaseService`.
- **UI Layer:** Zustand store controls UI state and triggers use case, consumed by React component.

This fully respects hexagonal design principles by:

- Isolating business logic from all infrastructure details.
- Defining clear ports/ports for persistence and DB service.
- Allowing easy swapping of DB providers by implementing `DatabaseServicePort`.
- Keeping UI, state, business logic, and infrastructure concerns separate and testable.

It offers a scalable, maintainable, and clean architecture for real-world React (and wildly adaptable to Flutter) apps.
