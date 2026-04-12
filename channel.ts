#!/usr/bin/env bun
/**
 * Thin MCP channel relay for Claude Code.
 *
 * Spawned by Claude as a subprocess. Connects back to the hub bot
 * via a Unix domain socket (path in RELAY_SOCKET env var).
 *
 * Inbound:  hub → socket → MCP notification → Claude
 * Outbound: Claude calls reply tool → socket → hub → Telegram
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import { connect } from "net"

const RELAY_SOCKET = process.env.RELAY_SOCKET
if (!RELAY_SOCKET) {
  process.stderr.write("channel: RELAY_SOCKET env var required\n")
  process.exit(1)
}

// Connect to the hub bot via Unix socket
const socket = connect(RELAY_SOCKET)
let socketReady = false
let buffer = ""

socket.on("connect", () => {
  socketReady = true
  process.stderr.write("channel: connected to hub\n")
})

socket.on("error", (err) => {
  process.stderr.write(`channel: socket error: ${err.message}\n`)
})

socket.on("close", () => {
  process.stderr.write("channel: hub disconnected\n")
  socketReady = false
})

function sendToHub(msg: Record<string, unknown>) {
  if (!socketReady) {
    process.stderr.write("channel: hub not connected, dropping message\n")
    return
  }
  socket.write(JSON.stringify(msg) + "\n")
}

// MCP server
const mcp = new Server(
  { name: "telegram-relay", version: "1.0.0" },
  {
    capabilities: {
      tools: {},
      experimental: {
        "claude/channel": {},
        "claude/channel/permission": {},
      },
    },
    instructions: [
      'Messages arrive as <channel source="telegram-relay" topic_id="..." user="...">.',
      "Reply using the reply tool. For responses longer than a sentence, call the",
      "reply tool multiple times with partial content (~200 chars per call) as you",
      "generate your response. Call reply with done=true on the final chunk.",
      "This enables real-time streaming to the user.",
      "Always pass the topic_id from the incoming message meta.",
    ].join(" "),
  },
)

// Tools
mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "reply",
      description:
        "Send a message chunk back to Telegram. Call multiple times for streaming. Set done=true on the last chunk.",
      inputSchema: {
        type: "object" as const,
        properties: {
          topic_id: {
            type: "string",
            description: "The topic_id from the incoming message meta",
          },
          text: { type: "string", description: "The text chunk to send" },
          done: {
            type: "boolean",
            description: "Set to true on the final chunk",
          },
        },
        required: ["topic_id", "text"],
      },
    },
  ],
}))

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === "reply") {
    const args = req.params.arguments as {
      topic_id: string
      text: string
      done?: boolean
    }
    sendToHub({
      type: "reply",
      topic_id: args.topic_id,
      text: args.text,
      done: args.done ?? false,
    })
    return { content: [{ type: "text", text: "sent" }] }
  }
  throw new Error(`unknown tool: ${req.params.name}`)
})

// Permission relay: forward permission requests to hub
const PermissionRequestSchema = z.object({
  method: z.literal("notifications/claude/channel/permission_request"),
  params: z.object({
    request_id: z.string(),
    tool_name: z.string(),
    description: z.string(),
    input_preview: z.string(),
  }),
})

mcp.setNotificationHandler(PermissionRequestSchema, async ({ params }) => {
  sendToHub({ type: "permission_request", ...params })
})

// Inbound: hub sends messages via socket → push as MCP notification
socket.on("data", (raw) => {
  buffer += raw.toString()
  const lines = buffer.split("\n")
  buffer = lines.pop()!

  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const msg = JSON.parse(line)
      if (msg.type === "message") {
        mcp.notification({
          method: "notifications/claude/channel",
          params: {
            content: msg.content,
            meta: msg.meta ?? {},
          },
        })
      } else if (msg.type === "permission_verdict") {
        mcp.notification({
          method: "notifications/claude/channel/permission",
          params: {
            request_id: msg.request_id,
            behavior: msg.behavior,
          },
        })
      }
    } catch (err) {
      process.stderr.write(`channel: failed to parse hub message: ${err}\n`)
    }
  }
})

// Start MCP transport
await mcp.connect(new StdioServerTransport())
process.stderr.write("channel: MCP server running\n")
