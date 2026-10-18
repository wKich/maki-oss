# Spec Delta

## MODIFIED Requirements

### Requirement: Live log streaming
The dashboard MUST stream live logs for a selected sandbox, support client-side filtering by source and level, allow pause and resume, and replay a bounded recent buffer on reconnect. A stream MUST stop when its client disconnects or the sandbox is deleted. Starting a stream MUST require the session token embedded in the served page (as a query parameter, since the browser's stream API cannot send headers); in read-only mode that token gates streams only and still never permits mutations. When a stream's last subscriber leaves and its log process has ended, the dashboard MUST release the hub's state so repeated streams for different sandbox names cannot grow memory without bound. An unauthenticated request MUST NOT spawn a log process.

#### Scenario: Logs flow end to end
- **WHEN** the user opens the logs view for a running sandbox
- **THEN** new log lines appear in the browser within two seconds

#### Scenario: Disconnect stops the tail
- **WHEN** the client disconnects
- **THEN** the dashboard terminates the spawned log process for that client

#### Scenario: Stream without token is refused
- **WHEN** a request reaches the log stream route without the session token
- **THEN** the dashboard returns 403 and no log process is spawned

#### Scenario: Read-only mode can still stream
- **WHEN** the dashboard runs with `--read-only` and the served page opens the log stream
- **THEN** the stream works, using the page's token, while every mutating route still returns 403

#### Scenario: Idle hub state is released
- **WHEN** a log stream's last subscriber disconnects and its log process has ended
- **THEN** a later stream for a different sandbox name does not retain the previous sandbox's buffered lines or process state
