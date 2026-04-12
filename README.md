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

## Setup

Requires [Bun](https://bun.sh) and [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated.

```bash
bun install
```

```bash
TELEGRAM_BOT_TOKEN=your_token AUTHORIZED_USER_ID=your_telegram_id bun run bot.ts
```

## systemd

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

## Security

The bot runs Claude with `--dangerously-skip-permissions`, which means Claude can execute arbitrary commands on the host. The auth middleware restricts access to a single Telegram user ID. This is a personal tool, not intended for multi-user or public use.
