import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import selfsigned from 'selfsigned';

const cacheDir = path.resolve(process.cwd(), '.server-tls');
const certPath = path.join(cacheDir, 'cert.pem');
const keyPath = path.join(cacheDir, 'key.pem');
const hostsPath = path.join(cacheDir, 'hosts.json');

export async function loadOrCreateAutoHttpsCertificate() {
  const hosts = getCertificateHosts();
  const expectedHostsJson = JSON.stringify(hosts, null, 2);

  try {
    const [cert, key, existingHostsJson] = await Promise.all([
      fs.readFile(certPath),
      fs.readFile(keyPath),
      fs.readFile(hostsPath, 'utf8'),
    ]);

    if (existingHostsJson === expectedHostsJson) {
      return { cert, key, hosts, generated: false };
    }
  } catch {
    // Generate or refresh the cached certificate below.
  }

  await fs.mkdir(cacheDir, { recursive: true });

  const generated = await selfsigned.generate(
    [{ name: 'commonName', value: hosts[0] || 'localhost' }],
    {
      days: 3650,
      algorithm: 'sha256',
      keySize: 2048,
      extensions: [
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true },
        {
          name: 'subjectAltName',
          altNames: hosts.map((host) => classifySubjectAltName(host)),
        },
      ],
    },
  );

  await Promise.all([
    fs.writeFile(certPath, generated.cert),
    fs.writeFile(keyPath, generated.private),
    fs.writeFile(hostsPath, expectedHostsJson),
  ]);

  return {
    cert: Buffer.from(generated.cert),
    key: Buffer.from(generated.private),
    hosts,
    generated: true,
  };
}

function getCertificateHosts() {
  const explicitHosts = String(process.env.AUTO_HTTPS_HOSTS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const hosts = new Set(['localhost', '127.0.0.1', '::1', ...explicitHosts]);
  const networkInterfaces = os.networkInterfaces();

  for (const addresses of Object.values(networkInterfaces)) {
    for (const address of addresses || []) {
      if (!address.internal && address.address) {
        hosts.add(address.address);
      }
    }
  }

  return Array.from(hosts);
}

function classifySubjectAltName(host) {
  const ipVersion = getIpVersion(host);
  if (ipVersion === 4 || ipVersion === 6) {
    return { type: 7, ip: host };
  }

  return { type: 2, value: host };
}

function getIpVersion(value) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) {
    return 4;
  }

  if (value.includes(':')) {
    return 6;
  }

  return 0;
}
