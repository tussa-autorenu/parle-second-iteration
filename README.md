# Tesla Command Reliability Overhaul

This project improves the reliability, observability, and production readiness of Tesla vehicle command execution by supporting both direct Fleet REST commands and Vehicle Command Protocol (VCP) proxy flows.

## Overview

Tesla command execution is not a single-path integration. Different vehicles and command scenarios require different handling depending on:

- whether the vehicle supports direct Fleet REST commands
- whether the vehicle requires Vehicle Command Protocol (VCP)
- whether the vehicle is awake or sleeping
- whether mobile access is enabled
- whether the user's Tesla OAuth token is still valid
- whether the command is being routed through the correct service

This implementation adds per-vehicle command routing, stronger error classification, retry handling for transient failures, wake-before-command behavior, and structured logging.

## Goals

- Improve Tesla command reliability without breaking vehicles that already work
- Support both direct Fleet REST and VCP-required vehicles
- Handle sleeping vehicles more gracefully
- Surface upstream Tesla errors clearly
- Keep the frontend API unchanged
- Preserve safe logging with sensitive data redacted

## Key Features

### Per-vehicle command routing
Vehicles are routed dynamically based on capability and prior detection:

- vehicles that support direct Fleet REST continue to use it
- vehicles that require VCP are routed through the official Tesla proxy
- VCP-required status can be detected and persisted per vehicle

### Wake-before-command flow
Before running certain commands, the system can wake the vehicle and poll until it is confirmed awake.

This reduces failures for sleeping vehicles and improves command success rates.

### Retry handling for transient failures
Direct Fleet REST commands now retry once on Tesla HTTP 5xx errors with a short delay.

This helps recover from transient Tesla upstream failures without affecting healthy flows.

### Explicit error classification
Known Tesla failure modes are classified into clearer application-level reasons such as:

- `vcp_required`
- `mobile_access_disabled`
- `vehicle_asleep_or_offline`
- `vehicle_not_found`
- `vehicle_in_service`
- `auth_expired_or_invalid`
- `generic_tesla_upstream_error`

### Structured logging
Command execution, retries, wake polling, proxy diagnostics, and upstream failures are logged using structured `pino` logs.

Sensitive values such as tokens and secrets are redacted before logging.

## Architecture

## Command execution layers

### 1. OAuth and partner setup
Tesla OAuth, partner registration, and public key hosting are required prerequisites, but they do not guarantee command success on their own.

### 2. Command routing
Each command is routed per vehicle:

- `direct_fleet_rest` for supported vehicles
- `proxy` / VCP flow for vehicles that require signed command execution

### 3. Vehicle state handling
Vehicle state affects command success:

- asleep vehicles may need waking first
- some vehicles may be in service
- some may have remote/mobile access disabled

### 4. Error interpretation
The real source of truth is Tesla's upstream response, not the wrapper error returned by the backend.

## Core Components

### `src/tesla/teslaApi.ts`
The central command engine.

Responsibilities:
- route commands between Fleet REST and proxy clients
- classify Tesla upstream errors
- detect VCP-required responses
- retry transient 5xx failures in direct REST mode
- classify `vehicle_in_service`
- emit structured logs

### `src/services/commandService.ts`
Higher-level command orchestration.

Responsibilities:
- wake-before-command flows
- retry handling for asleep vehicles
- idempotency checks
- ready-flow execution (`wake -> unlock -> enableDrive`)
- abort ready flow when unlock fails with `vehicle_in_service`

### `src/routes/commands.ts`
Command route handling.

Responsibilities:
- accept frontend command requests
- handle VCP auto-detection fallback
- retry auth failures after token refresh
- select mode based on per-vehicle capability flags
- emit scope mismatch warnings where relevant

### `src/tesla/teslaClient.ts`
HTTP client setup.

Responsibilities:
- create Fleet API client
- create Tesla proxy client
- configure keep-alive connection pooling

### `src/services/vehicleService.ts`
Vehicle capability persistence.

Responsibilities:
- persist per-vehicle VCP requirement state
- maintain vehicle identity and capability metadata

### `src/utils/errors.ts`
Shared error typing and classification support.

### `src/tesla/proxyDiagnostic.ts`
Startup diagnostic for proxy configuration and reachability.

## Data Model

The Vehicle model includes capability-tracking fields such as:

- `vcpRequired`
- `lastCapabilityCheckedAt`

These fields allow the system to remember which vehicles require VCP and avoid unnecessary routing ambiguity.

## Behavior Preserved

This overhaul was designed to improve failure handling without changing the public API or healthy vehicle behavior.

### Frontend API shape
Response format is unchanged:

- success: `{ ok: true, data }`
- failure: `{ ok: false, error: { reason, message, details } }`

New error reasons are additive values in the existing `reason` field.

### Working vehicles remain unaffected
Vehicles that already succeed via direct Fleet REST continue to use that path with no unnecessary extra latency.

### Idempotency remains intact
Existing `requestId`-based deduplication still prevents duplicate command execution.

### Logs remain safe
Sensitive fields continue to be redacted through `safeDetails()`.

## Notable Edge Cases Handled

### Sleeping vehicles
Commands no longer fail immediately when the vehicle is asleep. The system can wake and poll before retrying command execution.

### Transient Tesla 5xx failures
Direct REST commands retry once after a short delay instead of failing immediately on first 5xx response.

### Vehicles currently in service
Tesla responses indicating the vehicle is currently in service are now classified explicitly as `vehicle_in_service`.

In the ready flow, this aborts execution cleanly at `unlock` and prevents `enableDrive` from running afterward.

### VCP-required vehicles
Vehicles that reject direct REST commands due to VCP requirements are rerouted through the official Tesla proxy.

### Token refresh propagation
Refreshed OAuth tokens are forwarded correctly to both Fleet and proxy clients.

### Missing schema rollout state
Vehicle sync no longer crashes if VCP-related columns are not yet available in some environments.

## Lessons Learned

This integration involves multiple independent layers:

- Tesla OAuth and partner registration are necessary but not sufficient
- upstream Tesla errors are more meaningful than backend wrapper status codes
- VCP cannot be treated as a global fleet-wide switch
- the official Tesla proxy matters; a homemade forwarder is not equivalent
- VIN-based routing matters for proxy flows
- production service separation matters as much as code correctness

## Recommended Production Design

- keep the normal API and Tesla proxy as separate services
- use per-vehicle routing instead of a global command mode
- store clear mappings for:
  - local vehicle ID
  - Tesla numeric vehicle ID
  - VIN
- preserve upstream Tesla status, reason, and message in diagnostics
- use VIN as the canonical identifier for proxy/VCP flows

## Development Summary

Recent work in this project included:

- per-vehicle REST vs. VCP command routing
- proxy-mode auth refresh and forwarding fixes
- wake-first retry flow for sleeping vehicles
- improved Tesla vehicle diagnostics
- protection against sync crashes from missing VCP columns
- handling for direct REST 5xx retries
- explicit `vehicle_in_service` classification and ready-flow aborts


## Future Improvements

- add a formal per-vehicle capability refresh job
- expose clearer operational dashboards for route choice and upstream Tesla failures
- add more integration tests across direct REST and proxy/VCP paths
- centralize vehicle identity mapping in a single shared module
- improve production proxy health monitoring

## Conclusion

This overhaul turns the Tesla integration from a single-path command flow into a more robust command execution system. It supports both direct REST and VCP-required vehicles, improves resilience against common failure modes, and keeps behavior stable for working vehicles while making failures easier to diagnose and recover from.
