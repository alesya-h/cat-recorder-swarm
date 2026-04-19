import path from 'node:path';

export function getServerConfig() {
  const rootDir = process.cwd();

  return {
    host: '0.0.0.0',
    port: Number(process.env.PORT || 3001),
    recordingsDir: path.resolve(rootDir, process.env.RECORDINGS_DIR || 'recordings'),
    distDir: path.resolve(rootDir, 'dist'),
  };
}
