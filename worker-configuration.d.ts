// Minimal Cloudflare Workers type shims for this project.
// This keeps `npm run typecheck` working without pulling extra ambient types.

interface D1PreparedStatement {
	bind(...values: any[]): D1PreparedStatement;
	first<T = any>(): Promise<T | null>;
	all<T = any>(): Promise<{ results: T[] }>;
	run(): Promise<any>;
}

interface D1Database {
	prepare(query: string): D1PreparedStatement;
}

type ExecutionContext = {
	waitUntil(promise: Promise<any>): void;
};

interface ScheduledEvent {
	cron: string;
	scheduledTime: number;
	noRetry(): void;
}
