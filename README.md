<img width="512" height="512" alt="image" src="https://github.com/user-attachments/assets/2ea32634-09a4-49a7-ab0c-041ec2aef53f" /># Flagship

**An open-source feature flag service with a TypeScript SDK.**

Flagship lets you manage feature flags through an HTTP API and evaluate them in your application using a Node.js SDK.

Create flags, update their values, and fetch a versioned snapshot of your configuration. The SDK polls the API and evaluates flags locally, so your application does not need to make an API request for every flag check.

## Features

- **Feature flag management** — Create, read, update, and delete flags.
- **TypeScript SDK** — Evaluate flags directly in your Node.js application.
- **Local evaluation** — Evaluate flags using the latest snapshot held by the SDK.
- **User-based evaluation** — Pass user information to the evaluator for flag rules.
- **Snapshot endpoint** — Fetch the current flag configuration and its version.
- **ETag support** — Support conditional snapshot requests to avoid downloading unchanged data.
- **Polling and retries** — Refresh configuration periodically and retry after request failures.
- **Input validation** — Validate flag data before storing it.
- **In-memory storage** — Run the service locally without setting up a database.

## How it works

1. Create a flag through the API.
2. The API validates and stores the flag.
3. The SDK fetches a snapshot of the flags.
4. The SDK periodically refreshes the snapshot.
5. Your application evaluates flags locally using the SDK.

```text
Your application
       |
       v
  Flagship SDK
       |
       | Periodic snapshot requests
       v
   Flagship API
       |
       v
  Flag store
```

## Project structure

```text
flagship/
├── api/          # HTTP API built with Hono
├── evaluate/     # Shared flag evaluation logic and types
├── sdk-node/     # Node.js / TypeScript SDK
├── package.json  # Workspace configuration
└── README.md
```

The directory names above describe the intended package layout. Check your workspace configuration if your local folder names differ.

## Requirements

- Node.js
- pnpm
- TypeScript tooling configured by the project

## Getting started

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd flagship
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Start the API

```bash
cd api
pnpm start
```

The API should listen at:

```text
http://localhost:3000
```

Keep this terminal open while using the API.

If `pnpm start` is not configured in your local package, check `api/package.json` for the available scripts.

## API reference

The following endpoints are exposed by the API.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Check API health |
| `POST` | `/flags` | Create a flag |
| `GET` | `/flags` | List all flags |
| `GET` | `/flags/:key` | Get one flag |
| `PUT` | `/flags/:key` | Replace an existing flag |
| `DELETE` | `/flags/:key` | Delete a flag |
| `GET` | `/snapshot` | Get the current version and all flags |

### Health check

```http
GET http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok"
}
```

### Create a flag

```http
POST http://localhost:3000/flags
Content-Type: application/json
```

Request body:

```json
{
  "key": "new-checkout",
  "enabled": true,
  "offValue": false,
  "fallthrough": {
    "value": true
  },
  "rules": []
}
```

The `key` identifies the flag. `enabled` controls whether the flag is active, `offValue` is returned when it is disabled, `fallthrough.value` is the default value when no rule matches, and `rules` contains the targeting rules.

A successful creation returns `201 Created`. Creating a flag with an existing key returns `409 Conflict`.

### Get a flag

```http
GET http://localhost:3000/flags/new-checkout
```

### Update a flag

```http
PUT http://localhost:3000/flags/new-checkout
Content-Type: application/json
```

Request body:

```json
{
  "key": "new-checkout",
  "enabled": true,
  "offValue": false,
  "fallthrough": {
    "value": false
  },
  "rules": []
}
```

The flag key in the request body must match the key in the URL.

### Get a snapshot

```http
GET http://localhost:3000/snapshot
```

Example response:

```json
{
  "version": 2,
  "flags": {
    "new-checkout": {
      "key": "new-checkout",
      "enabled": true,
      "offValue": false,
      "fallthrough": {
        "value": false
      },
      "rules": []
    }
  }
}
```

The version is illustrative. The actual version depends on the number of successful changes made to the in-memory store.

The snapshot endpoint supports ETags. Clients can send the `If-None-Match` header to avoid downloading a snapshot when it has not changed.

## Using the Node.js SDK

The SDK polls the API and evaluates flags locally.

The following example assumes `FlagshipClient` is exported from your SDK's public entry point. Adjust the import to match your package exports.

```ts
import { FlagshipClient } from '@flagship/sdk-node';

const client = new FlagshipClient({
  url: 'http://localhost:3000',
  pollIntervalMs: 5000,
  onError(error) {
    console.error('Flagship error:', error);
  },
});

async function main() {
  await client.start();

  const user = { id: 'user-42' };

  const checkoutEnabled = client.isOn('new-checkout', user);

  console.log('New checkout enabled:', checkoutEnabled);

  client.close();
}

main().catch(console.error);
```

Use the import path that your package actually exports. If you have not configured package exports yet, import from the SDK's current source entry point while developing.

### SDK configuration

| Option | Description |
|---|---|
| `url` | Base URL of the Flagship API |
| `pollIntervalMs` | Interval between snapshot refreshes |
| `maxBackoffMs` | Maximum retry backoff delay |
| `requestTimeoutMs` | Timeout for snapshot requests |
| `fetch` | Optional custom Fetch implementation |
| `random` | Optional random function for retry jitter |
| `onChange` | Callback when a new snapshot is received |
| `onError` | Callback when a refresh fails |

Optional settings use the defaults defined by the SDK when omitted.

### Evaluation behavior

- `client.get(key, user, defaultValue)` returns the evaluated value or the supplied default when the flag is missing.
- `client.isOn(key, user)` returns `true` only when the evaluated value is exactly `true`.
- `client.close()` stops the SDK's polling activity.

Check the evaluator's type definitions for the supported flag value types and user targeting attributes.

## Testing

Run commands from the relevant package directory, or use your workspace scripts if they are configured.

### Test the API

Start the API:

```bash
cd api
pnpm start
```

Then check the health endpoint:

```bash
curl http://localhost:3000/health
```

You can also test the API using Postman.

### Test the SDK

From the SDK package directory:

```bash
cd sdk-node
pnpm test
```

Use the actual test script defined in `sdk-node/package.json` if it has a different name.

### Test the API and SDK together

1. Start the API.
2. Create a flag using Postman.
3. Start a script that uses `FlagshipClient`.
4. Change the flag through the API.
5. Wait for the SDK to poll again.
6. Verify that the SDK evaluates the updated value.

## Current limitations

- **In-memory storage:** Flags are lost when the API process restarts.
- **Single-process state:** Multiple API instances do not share flag data.
- **SDK refresh delay:** Updates are observed after the next successful poll, not necessarily immediately.
- **Production readiness:** Persistence, authentication, authorization, deployment configuration, and operational monitoring need to be assessed before production use.

## Roadmap

Potential future improvements:

- Persistent storage
- API authentication and access control
- More targeting operators and rule types
- A web dashboard for managing flags
- Additional SDKs
- Better observability and deployment tooling

## Contributing

Contributions, bug reports, and suggestions are welcome.

1. Fork the repository.
2. Create a branch for your change.
3. Make your changes and add tests.
4. Run the relevant checks.
5. Open a pull request describing the change.

## License

MIT License - Feel free to use this for learning and experimentation.

---

Thank you! Made with love ❤️ by Yasir Khan
