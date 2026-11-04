# LoadForge

**A TypeScript-based HTTP load testing tool built with Node.js.**

LoadForge is a learning-oriented project focused on building an HTTP load testing engine from scratch while exploring concurrency, asynchronous execution, resource management, and performance testing.

The project aims to provide a configurable way to send HTTP requests, control concurrency, manage execution, and analyze target server performance.

## Current Features

- **Bounded Request Queue:** FIFO task management with configurable capacity and producer backpressure.
- **Worker Pool:** Fixed-concurrency task execution with isolated task failures.
- **HTTP Client:** HTTP request execution with configurable timeouts and response duration measurement.
- **Load Test Service:** Coordinates request execution, configuration validation, and graceful worker shutdown.
- **Configuration Validation:** Uses Zod to validate load testing configurations.

## Architecture

```text
LoadForge
│
├── LoadTestService
│   └── Coordinates load test execution
│
├── WorkerPool
│   └── Controls concurrent task execution
│
├── RequestQueue
│   └── Manages pending tasks and backpressure
│
└── HttpClient
    └── Executes HTTP requests
```

## Tech Stack

- Node.js
- TypeScript
- Zod
- Vitest

## Roadmap

- [x] Milestone 1 — Request Queue
- [x] Milestone 2 — Worker Pool
- [x] Milestone 3 — HTTP Client
- [x] Milestone 4 — Request-based Load Testing
- [ ] Milestone 5 — Duration-based Load Testing
- [ ] Milestone 6 — Metrics Collection and Reporting
- [ ] Milestone 7 — Command Line Interface (CLI)
- [ ] Milestone 8 — Docker and CI/CD
- [ ] Milestone 9 — Monitoring and Production Readiness

## Testing

The project uses Vitest for unit and integration testing.

Run the test suite:

```bash
npx vitest run
```

## Project Goals

This project is also an opportunity to explore:

- Concurrency and asynchronous programming in Node.js.
- Queue management and backpressure.
- Graceful shutdown and task lifecycle management.
- HTTP performance measurement.
- Memory and resource management.
- Testing and production-ready engineering practices.

## Status

**Under active development.**

Features are being implemented incrementally, with individual development branches and tested milestones.

## License

To be decided.
