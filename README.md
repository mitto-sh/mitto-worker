# mitto-worker

Async Worker — processes background jobs from the queue.

## Responsibilities
- Process build jobs (triggers mitto-build)
- Process deploy jobs (triggers mitto-orchestrator)
- DB provisioning jobs
- Domain/SSL provisioning jobs
- Send deployment status webhooks and notifications

## Stack
> TBD

## Getting Started
```bash
cp .env.example .env
docker compose up
```
