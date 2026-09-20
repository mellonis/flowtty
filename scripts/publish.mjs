#!/usr/bin/env node
// Publish the @flowtty/* packages.
//
// In the repo every package's `exports` point at `src/*.ts`, so the workspace
// runs straight off source. A published package must point at `dist/` instead.
// This script flips `exports` for the duration of the publish and ALWAYS puts
// the source form back (try/finally, plus SIGINT), so a failed or interrupted
// publish never leaves the tree in the published shape.
//
//   node scripts/publish.mjs --otp 123456        publish under `latest`, then tag `alpha` — one
//                                                run; asks for a fresh code if the OTP expires
//   node scripts/publish.mjs --dry-run           build, flip, `npm publish --dry-run`, restore
//
// Versions are NOT bumped here — bump, commit, then run this. Packages whose
// version is already on the registry are skipped, so a partial run can be re-run.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

// Dependency order: a package is published after everything it depends on.
const PACKAGES = ['core', 'tty-backend', 'react', 'inline-tty-backend'];
const root = fileURLToPath(new URL('..', import.meta.url));

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const otpAt = args.indexOf('--otp');
const otp = otpAt >= 0 ? args[otpAt + 1] : process.env.NPM_OTP;

const manifestPath = (p) => `${root}packages/${p}/package.json`;
const run = (cmd, argv, cwd = root) => execFileSync(cmd, argv, { cwd, stdio: 'inherit' });

// src/x.ts → dist/x.js (dist/x.d.ts under a "types" key), recursively.
const flip = (value, key) => (typeof value === 'string'
  ? value.replace('./src/', './dist/').replace(/\.ts$/, key === 'types' ? '.d.ts' : '.js')
  : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, flip(v, k)])));
const targets = (value) => (typeof value === 'string' ? [value] : Object.values(value).flatMap(targets));

async function isPublished(name, version) {
  const res = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}/${version}`);
  return res.ok;
}

const originals = new Map();
const restore = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
  originals.clear();
};
process.on('SIGINT', () => { restore(); process.exit(130); });

if (!dryRun && !otp) {
  console.error('An OTP is required: --otp <code> (or NPM_OTP). Use --dry-run to rehearse.');
  process.exit(1);
}

try {
  run('npm', ['run', 'build']);

  for (const p of PACKAGES) {
    const file = manifestPath(p);
    const text = readFileSync(file, 'utf8');
    const manifest = JSON.parse(text);
    originals.set(file, text);
    manifest.exports = flip(manifest.exports);
    for (const t of targets(manifest.exports)) {
      if (!existsSync(`${root}packages/${p}/${t}`)) throw new Error(`${manifest.name}: exports target ${t} was not built`);
    }
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  const published = [];
  for (const p of PACKAGES) {
    const { name, version } = JSON.parse(readFileSync(manifestPath(p), 'utf8'));
    if (!dryRun && await isPublished(name, version)) {
      console.log(`== ${name}@${version} is already on the registry — skipping`);
      published.push([name, version]);
      continue;
    }
    console.log(`== ${dryRun ? 'dry run' : 'publishing'} ${name}@${version}`);
    // --ignore-scripts: the build already ran once for the whole workspace.
    const argv = ['publish', '--tag', 'latest', '--access', 'public', '--ignore-scripts'];
    if (dryRun) argv.push('--dry-run'); else argv.push(`--otp=${otp}`);
    run('npm', argv, `${root}packages/${p}`);
    published.push([name, version]);
  }

  if (!dryRun) {
    // A second registry write per package. The publish OTP usually still works;
    // when it has expired, ask for a fresh one (in a terminal) and carry on, so a
    // release is one run. Without a terminal, print the commands instead.
    let tagOtp = otp;
    for (const [name, version] of published) {
      const spec = `${name}@${version}`;
      for (let attempt = 0; ; attempt++) {
        try {
          run('npm', ['dist-tag', 'add', spec, 'alpha', `--otp=${tagOtp}`]);
          break;
        } catch {
          if (attempt >= 2 || !process.stdin.isTTY) {
            console.error(`!! could not tag ${spec} as alpha — run: npm dist-tag add ${spec} alpha --otp=<code>`);
            break;
          }
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          tagOtp = (await rl.question(`OTP expired? Enter a fresh code to tag ${spec} as alpha: `)).trim();
          rl.close();
        }
      }
    }
  }
  console.log(dryRun ? '== dry run complete' : '== all published');
} finally {
  restore();
}
