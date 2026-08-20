# Portfolio Signal Analyzer

A local, credential-safe portfolio analyzer for Fidelity holdings.

## Current MVP

- Primary `Connect Fidelity` action that expects a secure brokerage consent backend.
- Import holdings from CSV or enter positions manually.
- Calculate market value, allocation weights, concentration flags, and portfolio score.
- Generate transparent BUY / HOLD / SELL signals from configurable rules.
- Export the analysis as JSON.

## Run

Run the local server:

```powershell
node server.js
```

Then open:

```txt
http://localhost:8787
```

Do not open `index.html` directly as `file://` for Fidelity login. Browser API calls need a real local origin.

For SnapTrade configuration, set these environment variables before starting the server:

```powershell
$env:SNAPTRADE_CLIENT_ID="..."
$env:SNAPTRADE_CONSUMER_KEY="..."
$env:SNAPTRADE_USER_ID="..."
$env:SNAPTRADE_USER_SECRET="..."
node server.js
```

Or create `portfolio-analyzer/.env`:

```txt
SNAPTRADE_CLIENT_ID=...
SNAPTRADE_CONSUMER_KEY=...
SNAPTRADE_USER_ID=...
SNAPTRADE_USER_SECRET=...
PORT=8787
```

The browser setup panel will tell you whether this local configuration is ready.

You can also click `Connect Fidelity`, then use the SnapTrade credential dialog to save these values
to `.env` from the browser. This dialog is for SnapTrade API credentials only, not your Fidelity
username or password.

## CSV Format

Required columns:

- `ticker`
- `shares`
- `price`

Optional columns:

- `costBasis`
- `targetWeight`
- `expectedReturn`
- `volatility`
- `dividendYield`
- `momentum`

Example:

```csv
ticker,shares,price,targetWeight,expectedReturn,volatility,dividendYield,momentum
VTI,56,261.44,32,8,17,1.4,7.2
AAPL,32,188.91,12,7,27,0.5,-2.4
```

## Fidelity Login Path

Do not screen-scrape Fidelity or store brokerage credentials in this app.

The safer production path is a brokerage aggregation provider with OAuth-style consent. As of April 28, 2026, SnapTrade advertises Fidelity connectivity for holdings through Fidelity's consent flow, and its Fidelity integration page says trading is not available for that integration.

The frontend now expects these backend endpoints:

```txt
POST /api/brokerage/snaptrade/login?broker=fidelity
```

Returns one of:

```json
{ "loginUrl": "https://..." }
```

Then, after the provider redirects back with `?status=SUCCESS&connection_id=...`, the frontend calls:

```txt
GET /api/brokerage/holdings?connectionId=...
```

Returns either an array of normalized holdings or a provider response with `positions` / `holdings`.

Recommended production architecture:

1. Frontend opens the provider connection portal.
2. User authenticates directly with Fidelity and consents to selected accounts.
3. Backend stores only provider user IDs and encrypted access metadata.
4. Backend fetches accounts, balances, positions, and transactions from the provider API.
5. Analyzer normalizes holdings and produces explainable decision-support signals.

## SnapTrade Flow

Based on current SnapTrade docs, the backend flow is:

1. Create or look up a SnapTrade `userId` and encrypted `userSecret` for this app user.
2. Call SnapTrade's `POST https://api.snaptrade.com/api/v1/snapTrade/login`.
3. Include `broker: "fidelity"` if Fidelity's broker slug is available for your SnapTrade tenant.
4. Return the short-lived connection portal URL to the frontend.
5. On success, use the returned `connection_id` to find accounts and fetch positions/holdings.

## Important Boundary

Signals from this tool are decision support, not personalized financial advice. Before trading, review taxes, time horizon, liquidity needs, risk tolerance, and the current investment thesis.
