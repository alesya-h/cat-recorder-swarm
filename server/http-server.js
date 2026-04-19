import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { loadOrCreateAutoHttpsCertificate } from './auto-https.js';

export async function createHttpServer(expressApp) {
  if (process.env.HTTP_ONLY === '1') {
    return http.createServer(expressApp);
  }

  const certFile = process.env.HTTPS_CERT_FILE;
  const keyFile = process.env.HTTPS_KEY_FILE;

  if (certFile && keyFile) {
    const [cert, key] = await Promise.all([
      fs.readFile(path.resolve(certFile)),
      fs.readFile(path.resolve(keyFile)),
    ]);

    return https.createServer({ cert, key }, expressApp);
  }

  if (process.env.AUTO_HTTPS === '1') {
    const certificate = await loadOrCreateAutoHttpsCertificate();
    const mode = certificate.generated ? 'generated' : 'reused';
    console.log(`Using ${mode} self-signed HTTPS certificate for: ${certificate.hosts.join(', ')}`);
    return https.createServer({ cert: certificate.cert, key: certificate.key }, expressApp);
  }

  return http.createServer(expressApp);
}
