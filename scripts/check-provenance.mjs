import fs from 'fs/promises';
import path from 'path';

const packages = [
  'packages/format',
  'packages/chart'
];

let hasError = false;

for (const pkgDir of packages) {
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf8'));

  console.log(`Checking ${pkgJson.name}...`);

  if (!pkgJson.repository) {
    console.error(`::error file=${pkgJsonPath}::Missing "repository" field in ${pkgJsonPath}`);
    hasError = true;
    continue;
  }

  if (pkgJson.repository.type !== 'git') {
    console.error(`::error file=${pkgJsonPath}::"repository.type" should be "git" in ${pkgJsonPath}`);
    hasError = true;
  }

  if (!pkgJson.repository.url) {
    console.error(`::error file=${pkgJsonPath}::Missing "repository.url" in ${pkgJsonPath}`);
    hasError = true;
  }

  if (pkgJson.repository.directory !== pkgDir) {
    console.error(`::error file=${pkgJsonPath}::"repository.directory" should be "${pkgDir}" in ${pkgJsonPath}, got "${pkgJson.repository.directory}"`);
    hasError = true;
  }
}

if (hasError) {
  process.exit(1);
}

console.log('✓ Provenance metadata verification passed.');
