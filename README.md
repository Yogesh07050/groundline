# Groundline

A customer-support assistant that answers only from a business's own products and
policies. When it doesn't know something, it says so, hands off to a person, and
tells the team what to add to its knowledge.

Groundline has three parts:

- **An embeddable chat widget** that goes on any website with one line of HTML.
- **An operator console** for managing knowledge, reading conversations, working
  handoffs, and seeing what the assistant couldn't answer.
- **A demo storefront** for Nimbus Audio, a fictional brand, rendered from the same
  knowledge base the assistant uses.

## Quick start

Requires Node.js 20.19 or newer. `better-sqlite3` may compile during install, which
needs Python, `make`, and a C++ compiler if no prebuilt binary matches your Node version.

```bash
npm install
cp .env.example .env     # add GROQ_API_KEY and ADMIN_PASSWORD
npm run build
npm start
```

Open <http://localhost:3000>. Sign in to the console at `/app` with `ADMIN_EMAIL` and
`ADMIN_PASSWORD`. These are only read on first run, to create the account. If you leave
the password empty, a random one is printed once to the server log.

`npm start` runs in production mode, where session cookies are `Secure`. Browsers accept
that on `localhost`, except Safari: set `COOKIE_SECURE=false` there, or on any plain-http
host. Run behind HTTPS for real use.

Without a Groq key, the console still works and the widget explains it's offline.

### Development

```bash
npm run dev    # API on :3000, frontend with hot reload on :5180
```

### Docker

```bash
docker compose up --build    # reads .env; data persists in a named volume
```

### See it with data

The dashboard shows only real data, so it starts empty. To populate it, run the scenario
suite against the real model and save the results. They're labeled "Test scenario" and
can be filtered out or deleted:

```bash
npm run test:live -- --save
```

## How a reply is produced

```
Widget or playground
   │  POST /conversations/:id/messages
   ▼
Validate, rate limit, check the conversation's token
   ▼
Store the customer's message
   ▼
Retrieve: BM25 search over live knowledge entries,
          using the previous exchange to resolve follow-ups
   ▼
Ground:   system prompt with the matching facts and strict rules
   ▼
Stream:   Groq chat completion, sent to the browser over SSE
   ▼
Classify: answered / referred to team / no match / small talk
   ▼
Store the reply with its sources, model, latency, and token counts
```

**The server owns the conversation history.** Clients send only the new message, so a
visitor can't forge earlier assistant turns to steer the model.

**Retrieval is a keyword index, not a vector database.** For a catalog of this size,
in-memory BM25 is accurate and instant, with no embedding costs. For a much larger or more
loosely worded catalog, replace `server/src/modules/retrieval/`; the rest of the pipeline
only uses its `search` interface.

**Outcome labels are heuristics.** They come from retrieval results and reply wording. They
describe how the assistant behaved, not whether the customer's problem was solved, so treat
"answer rate" as a useful signal and not as a resolution rate.

## Project structure

```
server/
  src/
    config/env.ts        Validated environment configuration
    db/                  SQLite connection, migrations, first-run seed
    lib/                 Errors, logging, crypto, HTTP helpers
    middleware/          Error handling, rate limits, CORS
    modules/
      auth/              Operator accounts and sessions
      knowledge/         Entries, validation, CSV/JSON import
      retrieval/         Tokenizer and BM25 index
      chat/              Prompt, Groq client, pipeline, SSE, outcome classifier
      conversations/     Storage and operator routes
      handoffs/          Requests to reach a person
      analytics/         Reports computed from stored conversations
      settings/          Persona, brand, and widget settings
      publicApi/         Anonymous routes for the widget and storefront
    app.ts               Wires services and routes together
    index.ts             Process entry point
  widget/widget.js       The embeddable widget (no dependencies, no build)
  scripts/               Live scenario suite, password reset
  tests/                 API and unit tests
web/
  src/
    components/          Design-system primitives, charts, console layout
    lib/                 API client, streaming, formatting
    pages/               One file per screen
    styles/              Tokens, base components, page styles
```

## API overview

All routes are under `/api/v1`. Errors have one shape:
`{ "error": { "code", "message", "details?", "requestId" } }`.

| Area | Routes | Access |
|---|---|---|
| Widget | `GET /public/config`, `GET /public/catalog`, `POST /public/conversations` | Public, rate limited |
| Conversation | `GET /public/conversations/:id`, `POST .../messages` (SSE), `POST .../retry` (SSE), `POST .../messages/:id/feedback`, `POST .../handoff` | `X-Visitor-Token` for that conversation |
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/password` | Session cookie |
| Knowledge | `GET/POST /admin/knowledge`, `GET/PUT/PATCH/DELETE /admin/knowledge/:id`, `GET .../export`, `GET .../retrieval-test`, `GET .../templates/:type`, `GET/POST .../imports`, `POST .../imports/preview` | Operator |
| Conversations | `GET /admin/conversations`, `GET .../export.csv`, `GET/PATCH/DELETE /admin/conversations/:id` | Operator |
| Handoffs | `GET /admin/handoffs`, `PATCH /admin/handoffs/:id` | Operator |
| Reports | `GET /admin/analytics/overview`, `GET /admin/analytics/gaps`, `POST /admin/analytics/gaps/dismiss` | Operator |
| Settings | `GET/PUT /admin/settings`, `GET /admin/provider` | Operator |
| Playground | `POST /admin/playground/conversations`, `POST .../:id/messages` (SSE), `POST .../:id/retry` (SSE) | Operator |

## Importing knowledge

The console accepts `.csv` and `.json` files up to 2 MB and 1,000 rows. It validates every
row and shows what will change before saving. Rows are matched to existing entries by title.

- **CSV:** templates are on the import page. Separate list items with `|` and add
  specifications as `spec:weight` style columns.
- **JSON:** the console's own export, or `{ "products": [], "policies": [], "faqs": [] }`.

## Adapting it for a client

1. Replace the sample content on the **Knowledge** page, or import a file.
2. Set the persona, brand facts, support contacts, and accent color in **Settings**.
3. Paste the embed line from Settings into the client's site, and list their domain in
   `ALLOWED_ORIGINS`.

## Testing

```bash
npm test             # API, retrieval, and utility tests; no API key or network needed
npm run typecheck
npm run test:live    # real model: grounding, hallucination, and injection scenarios
```

`npm test` runs the real app against an in-memory database. Only the model is scripted.
`npm run test:live` skips cleanly when no key is set.

## Security notes

- The Groq key stays on the server. Passwords are hashed with scrypt; session and visitor
  tokens are stored only as hashes.
- Console cookies are `HttpOnly` and `SameSite=Lax`, and cross-site writes are also rejected
  by an origin check.
- The console and widget render model output as text nodes, never as HTML.
- CSV exports neutralize spreadsheet formula injection.
- Forgot the password? `npm run reset-password -- "<new password>" [email]`

## Known limitations

- **Handoffs don't send email.** Requests appear in the console for the team to answer. There
  is no mail provider, so connect one before promising customers an automatic notification.
- **The assistant can't see orders.** It answers from the knowledge base only and has no order
  system or checkout integration.
- **One workspace, one operator role.** There's no multi-tenancy, and additional operator
  accounts aren't exposed in the console.
- **Single instance.** SQLite and in-memory rate limits suit one server. Scaling out needs a
  shared database and a shared rate-limit store such as Redis.

Nimbus Audio, its products, prices, and policies are fictional sample data.

## License

MIT
