# Mermaid diagram cookbook (architecture)

Copy/adapt these. All render in GitHub, most markdown viewers, and Claude — no install.
Pick the diagrams that fit the change; you don't need all of them.

## C4 — System Context (level 1: system + actors + externals)
```mermaid
C4Context
  title System Context — <feature>
  Person(user, "User", "Who uses it")
  System(sys, "Our System", "What it does")
  System_Ext(ext, "External Service", "e.g. payment provider")
  Rel(user, sys, "Uses", "HTTPS")
  Rel(sys, ext, "Calls", "REST")
```

## C4 — Container (level 2: apps / services / datastores)
```mermaid
C4Container
  title Containers — <feature>
  Person(user, "User")
  System_Boundary(c, "Our System") {
    Container(web, "Web App", "React/Next", "UI")
    Container(api, "API", "FastAPI/Node", "Business logic")
    ContainerDb(db, "Database", "Postgres", "State")
    Container(worker, "Worker", "Queue consumer", "Async jobs")
  }
  Rel(user, web, "Uses", "HTTPS")
  Rel(web, api, "Calls", "JSON/HTTPS")
  Rel(api, db, "Reads/Writes", "SQL")
  Rel(api, worker, "Enqueues", "Queue")
```

## C4 — Component (level 3: inside the changed container)
```mermaid
C4Component
  title Components — <container>
  Container_Boundary(api, "API") {
    Component(ctrl, "Controller", "route", "HTTP in/out")
    Component(svc, "Service", "domain", "Business rules")
    Component(repo, "Repository", "data access", "Persistence")
  }
  ContainerDb(db, "Database", "Postgres")
  Rel(ctrl, svc, "calls")
  Rel(svc, repo, "calls")
  Rel(repo, db, "SQL")
```

## Sequence — key flow (include the failure path)
```mermaid
sequenceDiagram
  actor U as User
  participant W as Web
  participant A as API
  participant D as DB
  U->>W: Action
  W->>A: POST /resource
  A->>D: INSERT
  alt success
    D-->>A: ok
    A-->>W: 201 Created
  else validation error
    A-->>W: 422 + error envelope
  end
  W-->>U: Result
```

## ER / data model (when persistence changes)
```mermaid
erDiagram
  USER ||--o{ ORDER : places
  ORDER ||--|{ ORDER_ITEM : contains
  PRODUCT ||--o{ ORDER_ITEM : "ordered in"
  USER { uuid id PK
         string email
  }
  ORDER { uuid id PK
          uuid user_id FK
          string status
  }
```

## State machine (status / workflow)
```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Submitted: submit
  Submitted --> Approved: approve
  Submitted --> Rejected: reject
  Approved --> [*]
  Rejected --> Draft: revise
```

## Flowchart — module boundaries / data flow (when C4 is overkill)
```mermaid
flowchart LR
  subgraph client [Client]
    UI[UI components]
  end
  subgraph server [Server]
    API[API layer] --> SVC[Services] --> REPO[Repositories]
  end
  UI -->|HTTPS| API
  REPO -->|SQL| DB[(Database)]
```

Conventions: name nodes by responsibility, show the failure path in sequences, mark what is NEW vs UNCHANGED in the text around the diagram, and keep one source of truth in the ADR.
