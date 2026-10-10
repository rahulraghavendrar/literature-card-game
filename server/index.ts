import { lanUrls, startServer } from './app';

/**
 * Starts the Literature server.
 *   npm run dev   → development, with hot reload (http://localhost:3000)
 *   npm start     → production build from dist/ (run `npm run build` first)
 *
 * Environment:
 *   PORT                      port to listen on (default 3000)
 *   HOST                      interface to bind (default 0.0.0.0, i.e. reachable on your network)
 *   LITERATURE_EVENT_LOCK_MS  how long each announcement shows before the next move (default 2600)
 */
const mode = process.argv.includes('--dev') ? 'development' : 'production';
const port = Number(process.env.PORT ?? 3000);

const server = await startServer({
  port,
  host: process.env.HOST,
  mode,
  eventLockMs: process.env.LITERATURE_EVENT_LOCK_MS ? Number(process.env.LITERATURE_EVENT_LOCK_MS) : undefined,
  allowSeeds: process.env.LITERATURE_ALLOW_SEEDS === '1',
});

const lines = [
  '',
  `  Literature is running${mode === 'development' ? ' (development mode)' : ''}`,
  '',
  `  On this computer:     http://localhost:${server.port}`,
  ...lanUrls(server.port).map((u, i) => `  ${i === 0 ? 'Same Wi-Fi/network: ' : '                    '} ${u}`),
  '',
  '  Press Ctrl+C to stop.',
  '',
];
console.log(lines.join('\n'));

const shutdown = () => {
  void server.close().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
