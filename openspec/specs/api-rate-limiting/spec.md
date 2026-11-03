# api-rate-limiting Specification

## Purpose

The app-wide request limit of the web API: who it counts, and which callers it lets through. It protects the API from bursts by a single client without throttling the frontend's own server, which renders pages for every visitor and crawler.

## Requirements

### Requirement: The limit counts each real client

The system SHALL limit requests per client address. Behind the load balancer, the client address SHALL be the address that connected to the load balancer, taken from the last `X-Forwarded-For` entry it appends, so that clients behind one load-balancer node do not share a budget. Entries a client writes into `X-Forwarded-For` itself SHALL NOT change which budget it counts against. `TRUST_PROXY_HOPS` SHALL set the number of trusted proxies, default 1; `0` SHALL trust none.

#### Scenario: Burst from one client

- **GIVEN** the app-wide limit is 10 requests per second
- **WHEN** one client sends more than 10 requests within a second
- **THEN** the requests over the limit are answered 429

#### Scenario: Two clients behind the load balancer

- **GIVEN** one client has used its whole budget
- **WHEN** another client sends a request through the same load balancer
- **THEN** that request is not answered 429

#### Scenario: Client writes its own X-Forwarded-For

- **GIVEN** a client has used its whole budget
- **WHEN** it sends a request with a different address added to `X-Forwarded-For`
- **THEN** the request is answered 429

### Requirement: The frontend server's reads are not throttled

The system SHALL let a `GET` or `HEAD` request through the app-wide limit when its `x-frontend-render-token` header equals `FRONTEND_RENDER_THROTTLE_TOKEN`. Any other method SHALL keep the limit, with or without the header. A missing or different token SHALL be counted as usual. When `FRONTEND_RENDER_THROTTLE_TOKEN` is empty or unset, no request SHALL be exempt.

#### Scenario: Crawler burst rendered by the frontend

- **GIVEN** the frontend server sends the render token
- **WHEN** it reads the API more than 10 times within a second while rendering pages
- **THEN** none of those reads is answered 429

#### Scenario: Wrong token

- **WHEN** a client sends `x-frontend-render-token` with a value other than the configured token
- **THEN** its requests count against its limit as usual

#### Scenario: Write with the token

- **WHEN** a `POST` request carries the render token
- **THEN** it counts against the limit as usual

### Requirement: Internal service routes are not throttled

Requests under `/v1/service` SHALL NOT be subject to the app-wide limit.

#### Scenario: Service route

- **WHEN** a service sends requests to `/v1/service/...` faster than the app-wide limit
- **THEN** none of them is answered 429 by the app-wide limit
