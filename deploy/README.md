## Deploy (MVP)

This folder provides a minimal production scaffold for signaling:

- `docker-compose.yml` - runs signaling server and Nginx reverse proxy
- `nginx.conf` - WebSocket proxy endpoint on `/ws`

### Start

```bash
cd deploy
docker compose up -d
```

### Client URL

Use:

`ws://<your-host>:8080/ws`

For real production add:

- TLS termination (WSS)
- persistent storage backup
- metrics/log shipping
- horizontal scaling strategy
