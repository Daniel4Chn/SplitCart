# ADR-001: One web application with local Python processing

Status: accepted by user approval on 2026-10-16. Date: 2026-10-16.

## Context

Empty repository; a small receipt workflow needs web forms, reliable persistence, exact allocations, and Python-native image tools. Native binary execution and private persistent image storage constrain hosting more than CRUD volume does.

## Alternatives

1. Next.js plus local Python subprocess: one deployment and explicit JSON boundary; requires process supervision and a native-capable host.
2. Next.js plus FastAPI service: independent resource scaling/isolation and serverless web option; adds API authentication, network failures, service deployment, and coordinated contracts without demonstrated need.
3. React plus Express plus Python: flexible conventional API; adds framework/runtime surface that Next.js already supplies.
4. Python-first Django plus React/templates: integrated backend tools; moves business logic away from preferred TypeScript frontend and does not eliminate OCR supervision.
5. Browser-only OCR and local storage: low server load but device-variable performance, weaker reliable multi-device persistence, and a larger browser compute burden.

## Accepted decision

Next.js App Router/React/TypeScript and PostgreSQL; node-postgres with explicit migrations; Python/OpenCV/Tesseract CLI subprocess on one persistent Linux application host. Pure TypeScript domain engine, small runtime-validated JSON Python boundary, private image volume, bounded synchronous processing, Auth.js Google organizer sign-in before public deployment. No FastAPI, queue, Redis, ORM, object-storage service, or LLM initially.

## Consequences and revisit triggers

Accept native binary packaging, a single-host OCR capacity limit, compensating filesystem cleanup, and request deadlines. Demonstrate restart/timeout behavior and backups. Revisit a durable worker if real processing exceeds the supported request budget or measured demand causes unacceptable busy responses; revisit storage when multiple instances or provider constraints require it. Such changes need a new ADR and user approval where material. This plan does not authorize paid infrastructure.

References and complete tradeoff matrix: ../specs/architecture.md.
