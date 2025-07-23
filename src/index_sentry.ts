import * as Sentry from "@sentry/cloudflare";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { Props } from "./types";
import { GitHubHandler } from "./auth/github-handler";
import { closeDriver } from "./neo4j/connection";
import { registerAllTools } from "./tools/register-tools";

// Sentry configuration helper
function getSentryConfig(env: Env) {
	return {
		// You can disable Sentry by setting SENTRY_DSN to a falsey-value
		dsn: (env as any).SENTRY_DSN,
		// A sample rate of 1.0 means "capture all traces"
		tracesSampleRate: 1,
	};
}

export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "Knowledge Graph Memory Server",
		version: "1.0.0",
	});

	/**
	 * Cleanup Neo4j connections when Durable Object is shutting down
	 */
	async cleanup(): Promise<void> {
		try {
			await closeDriver();
			console.log('Neo4j connections closed successfully');
		} catch (error) {
			console.error('Error during Neo4j cleanup:', error);
		}
	}

	/**
	 * Durable Objects alarm handler - used for cleanup
	 */
	async alarm(): Promise<void> {
		await this.cleanup();
	}

	async init() {
		// Initialize Sentry
		const sentryConfig = getSentryConfig(this.env);
		if (sentryConfig.dsn) {
			// @ts-ignore - Sentry.init exists but types may not be complete
			Sentry.init(sentryConfig);
		}

		// Register all tools
		registerAllTools(this.server, this.env, this.props);
	}
}

export default new OAuthProvider({
	apiHandlers: {
		'/sse': MyMCP.serveSSE('/sse') as any,
		'/mcp': MyMCP.serve('/mcp') as any,
	},
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: GitHubHandler as any,
	tokenEndpoint: "/token",
});