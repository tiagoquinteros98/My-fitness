import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createMcpServer } from '../../server/mcp.js'

// MCP endpoint for Claude: /api/mcp/<MCP_SECRET>. Connectors can't send Basic Auth,
// so the secret in the path is the credential (middleware.ts lets this path through).

function authorized(request: Request): boolean {
  const secret = process.env.MCP_SECRET
  const key = new URL(request.url).pathname.split('/').pop()
  return !!secret && secret.length >= 32 && key === secret
}

async function handle(request: Request): Promise<Response> {
  if (!authorized(request)) return new Response('Not found', { status: 404 })
  // Stateless: a fresh server and transport per request.
  const server = createMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  return transport.handleRequest(request)
}

export { handle as GET, handle as POST, handle as DELETE }
