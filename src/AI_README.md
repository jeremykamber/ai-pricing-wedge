🧭 Hexagonal MVP Architecture Guide (Strict Edition)

Overview

This project follows a strict, domain-first Hexagonal Architecture — designed for scalability, maintainability, and AI-friendly automation.

The architecture enforces four isolated layers, each with a single purpose and zero circular dependencies.

src/
├── domain/           # Business rules, entities, and ports (pure logic)
├── application/      # Use cases that coordinate domain logic
├── infrastructure/   # External implementations (services, adapters, repositories)
├── actions/          # Next.js Server Actions that expose use cases to the client
└── ui/               # Framework-bound UI components and Zustand stores (for cross-tree state only)

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

🎨 4. Actions Layer (src/actions)
	•	Next.js Server Actions that expose use cases to client components.
	•	Each server action wraps one use case for a specific feature.
	•	Handles dependency instantiation (creates adapters, initializes use cases).
	•	Returns typed, serializable data to the client.
	•	Example:
	•	actions/generatePersonas.ts → "use server" function that calls GeneratePersonasUseCase.
	•	actions/registerUser.ts → "use server" function that calls RegisterUserUseCase.
	•	Server actions are NOT stores. They are simple async functions that bridge the domain/application layer to React components.

🎨 5. UI Layer (src/ui)
	•	Framework-dependent layer: React/Next.js components and Zustand stores.
	•	Divided into:
	•	components/ → React/Next.js UI components that call server actions and render state.
	•	stores/ → Zustand stores ONLY for shared state across component trees (avoid prop drilling).
	•	Components:
	•	Call server actions directly using useTransition() or onClick handlers.
	•	Manage form input state locally or with Zustand if cross-component sharing is needed.
	•	Render data; never contain business logic.
	•	Stores (Zustand):
	•	Use ONLY when state needs to be accessed across multiple components/pages without prop drilling.
	•	Example: Authentication state, app-wide theme, user preferences.
	•	Example NOT for stores: Form submissions, single-page feature state (use local state or server actions instead).

⸻

🔄 Communication Flow (Server Actions Pattern)

UI Components
     ↓
Server Actions (call use cases)
     ↓
Application (Use Cases)
     ↓
Domain (Entities + Ports)
     ↓
Infrastructure (Adapters implementing Ports)

**Key difference from traditional stores:**
- Server actions are lightweight, single-purpose functions—not state managers
- They're called directly from components using `useTransition()` or event handlers
- They handle dependency injection and return typed results
- State is managed locally in components (React hooks) or globally in Zustand (only if cross-tree sharing needed)
- No store-for-every-feature ceremony

🧱 Core Principles
	1.	Domain is King — All business logic lives in the domain layer.
	2.	Dependency Inversion — Upper layers depend on interfaces, not implementations.
	3.	Replaceability — You can swap Supabase for Firebase or any API adapter with zero domain or application changes.
	4.	Testability — Use cases are fully testable in isolation by mocking ports.
	5.	UI Dumbness — The UI knows nothing about logic; it just renders state and triggers actions.

🚀 Feature Development Workflow

When adding a new feature (e.g., GeneratePersonas):
1.Define Entities in domain/entities/.
•Example: Persona.ts defines Persona structure and validation helpers.
2.Define Ports (interfaces) in domain/ports/.
•Example: LlmServicePort.ts defines how the app expects LLM calls to work.
3.Implement Use Case in application/usecases/.
•Example: GeneratePersonasUseCase.ts orchestrates entity creation and calls the port.
4.Implement Adapter in infrastructure/adapters/.
•Example: OpenRouterAdapter.ts implements LlmServicePort with actual API calls.
4.5 Implement Services in infrastructure/services/ (if needed).
•Only if multiple adapters implement the same port (e.g., Supabase, Firebase both implement DatabaseServicePort).
5.Create Server Action in actions/.
•Example: actions/generatePersonas.ts with "use server" directive.
•Instantiate dependencies, call use case, handle errors, return typed result.
•This replaces the Zustand store (unless you need cross-component state sharing).
6.Create Component in ui/components/.
•Call server action via useTransition() or direct onClick.
•Manage local state with useState() for form inputs.
•If state must be shared across multiple components/trees, use Zustand—but only then.
•Render data; no business logic.
7.Write Tests in application/usecases/__tests__/.
•Test your use case logic using mocked adapters.

⸻

⚖️ Rules for AI Agents (and Humans)

✅ You can
	•	Add new entities, use cases, ports, adapters, services, server actions, or UI components.
	•	Create server actions in actions/ that wrap use cases (one action per use case, typically).
	•	Use existing Plop generators to scaffold consistent files (bunx plop `entity/port/usecase/adapter/action/component` `name`).
	•	Create new adapters to connect to APIs or services.
	•	Add framework utilities inside infrastructure/utils/ if needed.
	•	Use Zustand stores ONLY for state that genuinely needs to be shared across multiple components/trees without prop drilling.
	•	Call server actions directly from components using useTransition(), onClick, or other event handlers.

❌ You must not
	•	Add business logic to:
	•	UI components (except form input state)
	•	Server actions (only instantiate + call use cases)
	•	Zustand stores (stores should not contain business logic, only state)
	•	Adapters
	•	Reference infrastructure or UI code from domain or application layers.
	•	Modify existing use cases or entities to handle framework-specific concerns.
	•	Create a Zustand store for every feature—only use stores for genuinely shared, cross-tree state.

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



## ShadCN UI Component Usage Note

With shadcn, you must check the `src/components/ui` directory for shad cn components that are already installed in the project.

If there is a component you need that isn't yet installed, install it with the command: `bunx --bun shadcn@latest add <component_name>` (you cannot chain component names together; each component you want to install has to be a separate command run. NEVER do `bunx --bun shadcn@latest add <component_1> <component_2>`). It doesn't work.

They are automatically placed under @/components/ui.

Here's a list of the components that shadcn has to offer (component names will be those names, in lower case and snake case):

```
Accordion
Alert Dialog
Alert
Aspect Ratio
Avatar
Badge
Breadcrumb
Button Group
Button
Calendar
Card
Carousel
Chart
Checkbox
Collapsible
Combobox
Command
Context Menu
Data Table
Date Picker
Dialog
Drawer
Dropdown Menu
Empty
Field
Form
Hover Card
Input Group
Input OTP
Input
Item
Kbd
Label
Menubar
Native Select
Navigation Menu
Pagination
Popover
Progress
Radio Group
Resizable
Scroll Area
Select
Separator
Sheet
Sidebar
Skeleton
Slider
Sonner
Spinner
Switch
Table
Tabs
Textarea
Toast
Toggle Group
Toggle
Tooltip
```

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

---

## Example: GeneratePersonas Feature (Server Action Pattern)

This example shows the actual structure used in this codebase—using server actions instead of Zustand stores for single-feature state.

### 1. Domain Layer

**src/domain/entities/Persona.ts**
```typescript
export interface Persona {
    id: string;
    name: string;
    age: number;
    occupation: string;
    educationLevel: string;
    interests: string[];
    goals: string[];
    personalityTraits: string[];
    backstory?: string;
}

export function validatePersona(entity: Persona): boolean {
    return !!entity.id;
}
```

**src/domain/ports/LlmServicePort.ts**
```typescript
import { Persona } from "../entities/Persona";

export interface LlmServicePort {
    generateInitialPersonas(personaDescription: string): Promise<Persona[]>;
    generatePersonaBackstory(persona: Persona): Promise<string>;
}
```

### 2. Application Layer

**src/application/usecases/GeneratePersonasUseCase.ts**
```typescript
import { Persona } from "@/domain/entities/Persona";
import { LlmServicePort } from "../../domain/ports/LlmServicePort";

export class GeneratePersonasUseCase {
    constructor(private llmService: LlmServicePort) {}
    
    async execute(personaDescription: string): Promise<Persona[]> {
        console.log("Executing GeneratePersonas use case");
        const personas = await this.llmService.generateInitialPersonas(personaDescription);
        
        await Promise.all(
            personas.map(async (persona) => {
                persona.backstory = 
                    await this.llmService.generatePersonaBackstory(persona);
            }),
        );
        
        return personas;
    }
}
```

### 3. Infrastructure Layer

**src/infrastructure/adapters/OpenRouterAdapter.ts**
```typescript
import OpenAI from "openai";
import { LlmServicePort } from "@/domain/ports/LlmServicePort";
import { Persona } from "@/domain/entities/Persona";

export class OpenRouterAdapter implements LlmServicePort {
    private client: any;
    private model: string;

    constructor(client: any, model = "meta-llama/llama-3.3-70b-instruct:free") {
        this.client = client;
        this.model = model;
    }

    static createFromEnv(): OpenRouterAdapter {
        const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error("API key required");
        
        const baseURL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
        const model = process.env.OPENROUTER_MODEL || "gpt-4-turbo";
        const client = new OpenAI({ apiKey, baseURL });
        
        return new OpenRouterAdapter(client, model);
    }

    async generateInitialPersonas(personaDescription: string): Promise<Persona[]> {
        // Implementation calls LLM, parses JSON, returns Persona[]
        // ...
    }

    async generatePersonaBackstory(persona: Persona): Promise<string> {
        // Implementation calls LLM, returns backstory text
        // ...
    }
}
```

### 4. Server Action (No Store Needed!)

**src/actions/generatePersonas.ts**
```typescript
"use server"

import { GeneratePersonasUseCase } from "@/application/usecases/GeneratePersonasUseCase";
import { OpenRouterAdapter } from "@/infrastructure/adapters/OpenRouterAdapter";
import { Persona } from "@/domain/entities/Persona";

export async function generatePersonas(
    personaDescription: string,
): Promise<{ personas: Persona[] } | { error: string }> {
    try {
        // Instantiate dependencies
        const adapter = OpenRouterAdapter.createFromEnv();
        const useCase = new GeneratePersonasUseCase(adapter);
        
        // Call use case
        const personas = await useCase.execute(personaDescription);
        
        return { personas };
    } catch (error) {
        console.error("Error generating personas:", error);
        return { error: (error as Error).message };
    }
}
```

**That's it.** No Zustand store. No wrapper. Just a simple server action that:
1. Instantiates the adapter and use case
2. Calls the use case
3. Returns typed results or errors

### 5. UI Component

**src/ui/components/Dashboard.tsx**
```typescript
"use client"

import React, { useState } from 'react'
import { generatePersonas } from '@/actions/generatePersonas'
import { useTransition } from 'react'

export const Dashboard: React.FC = () => {
    const [pricingUrl, setPricingUrl] = useState('')
    const [personas, setPersonas] = useState(null)
    const [isPending, startTransition] = useTransition()

    const handleAnalyze = () => {
        if (!pricingUrl.trim()) return

        startTransition(async () => {
            const result = await generatePersonas(pricingUrl)
            
            if ('error' in result) {
                console.error(result.error)
            } else {
                setPersonas(result.personas)
            }
        })
    }

    return (
        <div>
            <input
                value={pricingUrl}
                onChange={(e) => setPricingUrl(e.target.value)}
                placeholder="Pricing page URL"
            />
            <button 
                onClick={handleAnalyze}
                disabled={isPending}
            >
                {isPending ? 'Analyzing...' : 'Analyze'}
            </button>
            
            {personas && (
                <div>
                    {personas.map((p) => (
                        <div key={p.id}>
                            <h3>{p.name}</h3>
                            <p>{p.backstory}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
```

---

## Summary

- **Domain Layer:** `Persona` entity, `LlmServicePort` interface
- **Application Layer:** `GeneratePersonasUseCase` orchestrates the flow
- **Infrastructure Layer:** `OpenRouterAdapter` implements the LLM port
- **Server Action:** `generatePersonas.ts` instantiates dependencies and calls the use case
- **UI Component:** Calls the server action directly via `useTransition()`

**No Zustand store needed.** State lives in the component. This keeps the architecture clean:
- Business logic is 100% testable in the use case (no UI coupling)
- Infrastructure is swappable (could replace OpenRouterAdapter with another LLM provider)
- Components are dumb—they just call actions and render state
- Server actions are thin wrappers—they instantiate and delegate

This is lean, pragmatic, and **far more maintainable** than ceremony-heavy store-for-every-feature approaches.
