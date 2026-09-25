# TinyLink

TinyLink is a small URL shortener built for learning system design concepts with a simple Spring Boot backend, an Angular frontend, and Redis for caching and distributed rate-limit state.

This project is intentionally small and easy to inspect. It demonstrates request flow, redirects, caching, rate limiting, click analytics, scheduled cleanup, and containerized local development.

## What It Does

- Create a short URL from a long URL
- Optionally accept a custom alias
- Optionally set an expiration time
- Redirect a short URL to the original URL
- Track click counts for each short URL
- Return basic stats and analytics data
- Apply per-client/IP rate limiting on the shorten API
- Cache short-code lookups in Redis
- Periodically mark expired URLs inactive

## Current Architecture

The current codebase uses in-memory Java collections as the main application store.

- `urlMappings` stores short code -> `UrlData`
- `clickAnalytics` stores short code -> list of `ClickEvent`
- Redis stores:
  - cached `shortCode -> originalUrl` entries
  - serialized `RateLimitData` entries for rate limiting

- Frontend: Angular SPA
- Backend: Spring Boot REST API
- Redis: cache + shared rate-limit state
- Docker Compose: local orchestration

## Project Structure

```text
tiny-link/
|-- backend/
|   |-- src/main/java/com/shaybytes/tinylink/
|   |   |-- config/
|   |   |-- controllers/
|   |   |-- dto/
|   |   |-- models/
|   |   |-- services/
|   |-- src/main/resources/application.yml
|   |-- Dockerfile
|   `-- pom.xml
|-- frontend/
|   |-- src/
|   |   |-- app/app.component.ts
|   |   `-- main.ts
|   |-- Dockerfile
|   `-- package.json
|-- docker-compose.yml
`-- README.md
```

## Services and Ports

- Frontend: `http://localhost:8082`
- Backend API: `http://localhost:8080`
- Redis: `localhost:6379`

## Quick Start

From the project root:

```powershell
docker compose up --build
```

Then open:

- Frontend UI: `http://localhost:8082`
- Backend health endpoint: `http://localhost:8080/api/health`

To stop:

```powershell
docker compose down
```

To force a full rebuild/recreate:

```powershell
docker compose up -d --build --force-recreate
```

## API Endpoints

### Create short URL

```http
POST /api/shorten
Content-Type: application/json

{
  "originalUrl": "https://example.com/very/long/url",
  "customAlias": "optional-code",
  "expiresAt": "2026-12-31T23:59:59"
}
```

### Redirect to original URL

```http
GET /api/{shortCode}
```

Note: the generated short URL now points to `/api/{shortCode}` because that is the actual backend redirect route.

### Get basic stats

```http
GET /api/stats/{shortCode}
```

### Get analytics

```http
GET /api/analytics/{shortCode}
```

### Delete short URL

```http
DELETE /api/{shortCode}
```

### Health check

```http
GET /api/health
```

## End-to-End Flow

### 1. Create short URL

1. The Angular frontend sends `POST /api/shorten`
2. The backend controller extracts the client IP
3. The rate limiter checks whether that client is allowed
4. The service either uses the provided custom alias or generates a random Base62 code
5. The backend stores `UrlData` in the in-memory map
6. The backend caches `shortCode -> originalUrl` in Redis
7. The backend returns a response containing:
   - `shortUrl`
   - `shortCode`
   - `originalUrl`
   - timestamps

### 2. Open short URL

1. The browser requests `/api/{shortCode}`
2. The backend first checks Redis cache for the original URL
3. If not found in Redis, it checks the in-memory `urlMappings`
4. If the URL is expired, it is marked inactive and the request returns `404`
5. If found, the backend records a click and responds with HTTP `302 Found`
6. The browser follows the redirect to the original URL

### 3. Load stats

1. The frontend sends `GET /api/stats/{shortCode}`
2. The backend reads `UrlData`
3. The backend returns click count, creator IP, active status, and timestamps

### 4. Scheduled cleanup

1. Spring scheduling is enabled in the application
2. `CleanupScheduler` runs every configured interval
3. Expired URLs are marked inactive
4. Related Redis cache entries are deleted

## Core Backend Components

### `UrlShortenerController`

Responsible for HTTP endpoints:

- create short URL
- redirect
- get stats
- get analytics
- delete URL
- health check

### `UrlShortenerServiceImpl`

Responsible for:

- generating short codes
- storing URL data
- redirect lookup
- click tracking
- stats/analytics response building
- Redis cache read/write
- cleanup of expired URLs

### `RateLimitServiceImpl`

Responsible for:

- checking whether a client/IP can call the shorten API
- reading and writing `RateLimitData` from Redis
- falling back to local memory if Redis is unavailable

### `RedisConfig`

Configures `RedisTemplate<String, Object>` and the JSON serializer used to store Java objects in Redis.

Important implementation detail:

- `LocalDateTime` support is explicitly configured through Jackson's Java Time module so `RateLimitData` can be serialized correctly.

## Models and What They Mean

### `UrlData`

Represents one shortened URL.

Contains:

- original URL
- short code
- created/expiry timestamps
- click count
- creator IP
- active flag

### `ClickEvent`

Represents one redirect/click event.

Contains:

- timestamp
- IP address
- user agent
- referrer
- optional country/city fields

### `RateLimitData`

Represents the temporary rate-limit state for one client/IP.

Contains:

- `requestCount`
- `windowStart`
- `lastRequest`

Important:

- `requestCount` is not the total number of clicks on a URL
- it is only the temporary request counter used for rate limiting

## Redis Usage

Redis is used in two places.

### 1. URL cache

Key shape:

```text
url:{shortCode}
```

Value:

- original URL string

Purpose:

- fast redirect lookup
- demonstrate cache-aside pattern
- reduce repeated reads from the main store

TTL:

- configured through `tinylink.cache.ttl-minutes`

Even though URLs are not editable today, TTL is still useful for:

- automatic cleanup of cold cache entries
- reducing memory growth
- avoiding stale values after delete/expiry

### 2. Rate-limit state

Key shape:

```text
ratelimit:{clientIp}
```

Value:

- serialized `RateLimitData`

Purpose:

- share rate-limit state across app instances
- avoid relying only on local Java memory

TTL:

- one hour on save

This prevents unused rate-limit keys from living forever.

## Rate Limiting

Rate limiting is checked before shortening a URL.

Current behavior:

- per client/IP
- minute threshold configurable
- hour threshold configurable
- Redis-backed when available
- falls back to in-memory storage if Redis fails

High-level flow:

1. Build Redis key from client IP
2. Read `RateLimitData` from Redis
3. If missing, use or create local in-memory state
4. Check whether the current request is still in the same minute window
5. Reset the minute counter if the old window expired
6. Increment the request count if allowed
7. Save the updated state back to Redis

Important learning note:

- `requestCount` is a rate-limit counter
- `clickCount` is a URL analytics counter

These are different and should not be confused.

## Frontend UI Notes

The Angular UI allows you to:

- create short URLs
- see the generated short URL
- fetch stats for a short code

The UI now explicitly explains the difference between:

- rate-limit requests: per client/IP, temporary
- URL clicks: per short URL, analytics

## Configuration

Main backend configuration is in:

- [backend/src/main/resources/application.yml](backend/src/main/resources/application.yml)

Key settings:

- `tinylink.base-url`
- `tinylink.short-code.length`
- `tinylink.short-code.max-attempts`
- `tinylink.cache.ttl-minutes`
- `tinylink.rate-limit.requests-per-minute`
- `tinylink.rate-limit.requests-per-hour`
- `tinylink.cleanup.interval-minutes`

Redis connection settings use Spring Boot 3 style properties:

- `spring.data.redis.host`
- `spring.data.redis.port`

## Docker Notes

`docker-compose.yml` starts:

- frontend
- backend
- redis

The backend container is configured to reach Redis through:

- `SPRING_DATA_REDIS_HOST`
- `SPRING_DATA_REDIS_PORT`

## What We Corrected

The following issues were fixed while working on this project:

- corrected Spring Boot Redis property naming to `spring.data.redis`
- configured Redis serialization for `LocalDateTime`
- made Redis cache operations fail-safe so URL creation does not crash if Redis is unavailable
- fixed generated short URLs to point to `/api/{shortCode}`
- updated the frontend UI text to explain rate-limit requests vs URL clicks
- expanded comments in the rate-limiting implementation for learning purposes

## Current Limitations

This project is useful for learning, but it is not yet production-grade.

Current limitations:

- main storage is in-memory, so data is lost when the backend restarts
- no persistent database yet
- hourly rate limiting is simplified
- rate-limit updates are not fully atomic
- no authentication or ownership model
- delete marks URLs inactive but does not provide audit/history
- click analytics are stored in memory only

## Good Next Steps

If you want to evolve this into a stronger system design project, the next improvements would be:

- replace in-memory maps with PostgreSQL or another persistent database
- use Redis atomic counters or Lua scripts for robust rate limiting
- add proper analytics persistence
- add tests for controller/service flows
- support custom domains
- add admin or ownership features for managing URLs
- add observability/metrics

## Development

### Backend

```powershell
cd backend
mvn test
mvn spring-boot:run
```

### Frontend

```powershell
cd frontend
npm install
npm start
```

Frontend dev server:

- `http://localhost:4200`

Backend API:

- `http://localhost:8080`


✍️ Author:
👨‍💻 Alex Freyssinier
📍Mexico City CDMX 

📫 freyssinieralexandro@gmail.com

🔗LinkedIn: https://www.linkedin.com/in/javier-alejandro-d%C3%A1valos-freyssinier-b77b992a3/

🐈‍⬛ https://github.com/A-Frey13