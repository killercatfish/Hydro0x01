# HydroOne System Architecture

## Overview
HydroOne utilizes a high-performance, schema-driven architecture using Fastify and an edge-compatible React dashboard using Vite.

## Components
1. **ESP32 Firmware**: Written in modern C++, communicates via MQTT v5 with TLS.
2. **Backend**: Fastify + Zod API with real-time Socket.io syncing.
3. **Frontend**: Vite + React + Zustand + Tailwind SPA.
4. **Data Infrastructure**: Prisma (PostgreSQL) for Config and Actuation logs, InfluxDB for time-series Telemetry data.

## Data Flow
- **Telemetry**: Device -> MQTT (`HydroOne/HydroNode_01/sensors/...`) -> Fastify Backend (MQTT Subscriber) -> Parallel Write: InfluxDB + Socket.io broadcast -> Frontend Zustand store.
- **Commands**: Frontend Control Panel -> REST API (`POST /api/system/*`) -> Fastify Backend logs to Prisma -> Fastify publishes to MQTT (`HydroOne/HydroNode_01/cmd/*`) -> Device actions hardware.
