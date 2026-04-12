# claude-relay

Telegram bot that relays messages to [Claude Code](https://docs.anthropic.com/en/docs/claude-code) in headless mode. Each Telegram message topic becomes an independent Claude session with full access to the filesystem, shell, and tools.

## How it works

1. You send a message in a Telegram topic
2. The bot spawns `claude -p <message> --output-format json`
3. For follow-up messages, it uses `--resume <session_id>` to continue the conversation
4. The response is sent back to the same topic

Session state (topic → session ID mapping) is persisted in `state.json` and survives restarts.

## Features

- **Persistent sessions** — each topic keeps its own Claude conversation via `--resume`
- **Image support** — photos are downloaded and passed to Claude as file paths
- **File sending** — Claude can send files back via a `{"__file__": "/path"}` JSON convention
- **AskUserQuestion** — Claude's interactive questions are rendered as inline keyboard buttons
- **Auth guard** — only responds to a single authorized Telegram user ID
- **Concurrency control** — one Claude process per topic at a time

## Installation

### Prerequisites

- [Bun](https://bun.sh) (runtime)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed and authenticated
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Your Telegram user ID (you can get it from [@userinfobot](https://t.me/userinfobot))

### From source

```bash
git clone https://github.com/roziscoding/claude-relay.git
cd claude-relay
bun install
```

Create a `.env` file or export the variables directly:

```bash
export TELEGRAM_BOT_TOKEN=your_token
export AUTHORIZED_USER_ID=your_telegram_id
```

Run:

```bash
bun run bot.ts
```

### Docker

Build the image:

```bash
docker build -t claude-relay .
```

Run the container. You need to mount your Claude Code config directory so the CLI is authenticated inside the container:

```bash
docker run -d \
  --name claude-relay \
  -e TELEGRAM_BOT_TOKEN=your_token \
  -e AUTHORIZED_USER_ID=your_telegram_id \
  -e ANTHROPIC_API_KEY=your_api_key \
  -v claude-relay-state:/app/state \
  claude-relay
```

### Docker Compose

```yaml
# compose.yml
services:
  claude-relay:
    build: .
    restart: always
    environment:
      - TELEGRAM_BOT_TOKEN=your_token
      - AUTHORIZED_USER_ID=your_telegram_id
      - ANTHROPIC_API_KEY=your_api_key
    volumes:
      - state:/app/state

volumes:
  state:
```

```bash
docker compose up -d
```

### systemd

If you prefer running it directly on the host as a user service:

```ini
[Unit]
Description=Claude Telegram Relay
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/claude-relay
ExecStart=bun run bot.ts
Environment=TELEGRAM_BOT_TOKEN=xxx
Environment=AUTHORIZED_USER_ID=xxx
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

Enable with `loginctl enable-linger` so it runs without an active login session.

## Security

The bot runs Claude with `--dangerously-skip-permissions`, which means Claude can execute arbitrary commands on the host (or inside the container). The auth middleware restricts access to a single Telegram user ID. This is a personal tool, not intended for multi-user or public use.
