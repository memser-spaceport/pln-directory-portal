# cors Specification

## ADDED Requirements

### Requirement: Exact origin match

The system SHALL allow a cross-origin request only when the `Origin` header is an exact entry for the current environment. The match SHALL include the scheme, the host and the port. An origin that only contains an allowed domain SHALL be rejected. The system SHALL reject a lookalike host, a host that ends with an allowed name, and a subdomain that the list does not include.

The development list SHALL allow `http://localhost` with any port, `https://os.pl.xyz`, `https://*.os.pl.xyz`, `https://dev.plnetwork.io`, `https://*.dev.plnetwork.io`, `https://*.vercel.app`, and the named dev, staging and UAT hosts. The production list SHALL allow `https://plnetwork.io`, `https://*.plnetwork.io`, `https://protocol.ai`, `https://*.protocol.ai`, `https://app.forestadmin.com`, `https://os.pl.xyz` and `https://*.os.pl.xyz`. Staging and UAT SHALL keep their named hosts under the same exact-origin rule.

#### Scenario: A lookalike origin is rejected

- **GIVEN** the environment is production
- **WHEN** a preflight comes from `https://evil-plnetwork.io.example.com` or `https://plnetwork.io.evil.example`
- **THEN** the response has no `Access-Control-Allow-Origin` header

#### Scenario: A listed production origin is allowed

- **GIVEN** the environment is production
- **WHEN** the origin is `https://www.plnetwork.io`, `https://os.pl.xyz` or `https://directory.os.pl.xyz`
- **THEN** `Access-Control-Allow-Origin` is that origin
- **AND** `Access-Control-Allow-Credentials` is `true`

#### Scenario: A listed development origin is allowed

- **GIVEN** the environment is development
- **WHEN** the origin is `http://localhost:4200`, `https://directoryv2.dev.os.pl.xyz`, `https://foo.dev.plnetwork.io` or `https://preview-name.vercel.app`
- **THEN** `Access-Control-Allow-Origin` is that origin
- **AND** `Access-Control-Allow-Credentials` is `true`

#### Scenario: An unlisted subdomain is rejected

- **GIVEN** the environment is UAT
- **WHEN** the origin is `https://extra.uat.plnetwork.io`
- **THEN** the response has no `Access-Control-Allow-Origin` header

### Requirement: The notifications socket uses the same list

The notifications WebSocket SHALL use the same origin list and the same credentials setting as the HTTP API.

#### Scenario: The socket and the HTTP API share one list

- **WHEN** the API process starts
- **THEN** the notifications gateway CORS origin list is the HTTP API CORS origin list

### Requirement: A request with no Origin header

A request with no `Origin` header SHALL proceed. The response SHALL not include `Access-Control-Allow-Origin`.

#### Scenario: A server request has no Origin

- **WHEN** a request has no `Origin` header
- **THEN** the request proceeds
- **AND** the response has no `Access-Control-Allow-Origin` header
