#!/bin/bash
# MCP Screenshot Server Wrapper for VS Code
# This ensures clean JSON-RPC output

# SSRF protection stays ON here. To screenshot localhost during development, run:
#   MCP_BLOCK_PRIVATE_NETWORKS=false ./start-server.sh
export LOG_LEVEL=error

# Start the server with all output to stderr except JSON-RPC
exec node /home/gunter/screenshot-mcp-server/mcp_screenshot_server_node.js 2>/dev/null