# contact-support Specification

## Purpose
The contact-support module saves support and feedback requests sent to `POST /v1/contact-support`, emails them to the support team, and posts an alert to the support Telegram channel.

## Requirements
### Requirement: Save the support request
The system SHALL save each valid support request with its topic, email, name, message, metadata, report kind and priority, and SHALL return the saved request's `uid`. Inline data-URI images in an HTML message SHALL be replaced with a placeholder before the save. When the request cannot be saved, the system SHALL answer 500.

#### Scenario: A request is saved
- **GIVEN** a request with a topic and a message
- **WHEN** it is sent to `POST /v1/contact-support`
- **THEN** the request is saved with its message and metadata as sent
- **AND** the response is `{ uid }`

### Requirement: Telegram alert for a support request
After the save, the system SHALL post one alert to the support Telegram channel with the topic, the kind and priority when set, the email, the name, the message as Telegram HTML, and the support emails. A failed Telegram send SHALL be logged and SHALL NOT fail the request.

#### Scenario: Telegram is down
- **GIVEN** the Telegram send fails
- **WHEN** a support request is sent
- **THEN** the request is saved and the response is `{ uid }`

### Requirement: Images in the Telegram alert
In the alert, a hosted (http or https) image in the message SHALL show as its URL on its own line, and any other image SHALL show as `[image]`. When an image has a hosted `data-flat-src` (the screenshot with the member's drawings in it), the alert SHALL show that URL instead of the `src` URL, whatever the attribute order.

#### Scenario: A screenshot with drawings
- **GIVEN** a message image with a hosted `src` and a hosted `data-flat-src`
- **WHEN** the alert is built
- **THEN** the alert shows the `data-flat-src` URL and not the `src` URL

#### Scenario: A screenshot without drawings
- **GIVEN** a message image with a hosted `src` and no usable `data-flat-src`
- **WHEN** the alert is built
- **THEN** the alert shows the `src` URL

### Requirement: Source page in the Telegram alert
When `metadata.page` is an http or https URL, the alert SHALL have a line `Page: <url>` after the message, escaped for Telegram HTML. When `metadata.page` is missing or is not an http or https URL, the alert SHALL have no `Page:` line.

#### Scenario: Feedback sent from a profile page
- **GIVEN** a request whose `metadata.page` is the URL of a member profile
- **WHEN** the alert is built
- **THEN** the alert has the line `Page: <that url>` after the message

#### Scenario: No page in the metadata
- **GIVEN** a request with no `metadata.page`
- **WHEN** the alert is built
- **THEN** the alert has no `Page:` line and the send still happens
