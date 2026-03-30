#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "../core/config.js";
import { registerTools } from "./tools.js";

const config = loadConfig();

const server = new McpServer({
  name: "kore-chamber",
  version: "0.4.0",
});

registerTools(server, config.vaultPath);

const transport = new StdioServerTransport();
await server.connect(transport);
