// No client script may reach a Node builtin, however many hops away.
//
// THE BUG THIS EXISTS FOR. `src/scripts/admin/clients.ts` imported `customerPasswordProblem` from
// `src/lib/customer/auth.ts`, which imports `node:crypto` for scrypt and HMAC. Vite externalises
// `node:crypto` for the browser and its stub THROWS on first property access, so the module failed
// at import scope and every handler on the admin Customers screen never bound — "Add customer",
// "Reset password" and the Active switch all silently did nothing, with one console error.
//
// Nothing caught it. Typecheck is happy (the types are real), lint is happy, the build only WARNED,
// and no unit test imports a page's script graph the way a browser does. The failure is a property
// of the import graph, so that is what this checks.
//
// The fix in that case was to split the pure part out (src/lib/customer/password-policy.ts). That is
// the general remedy: if a client needs a constant or a validator that lives beside server crypto,
// move the shared part to its own Node-free module rather than importing the server one.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/** Every relative import specifier in a source file. */
function importsOf(file: string): string[] {
  const src = fs.readFileSync(file, 'utf8');
  const out: string[] = [];
  // `import … from 'x'`, `export … from 'x'`, and `import('x')`.
  const re = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const spec = m[1] ?? m[2];
    if (spec) out.push(spec);
  }
  return out;
}

function resolve(fromFile: string, spec: string): string | undefined {
  if (!spec.startsWith('.')) return undefined; // bare or node: — handled by the caller
  const p = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [p, `${p}.ts`, path.join(p, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

/** Walks the import graph from `entry`, returning the first `node:*` import and how it got there. */
function nodeBuiltinReachableFrom(entry: string): string | undefined {
  const seen = new Set<string>();
  const stack: Array<{ file: string; trail: string[] }> = [{ file: entry, trail: [entry] }];
  while (stack.length) {
    const { file, trail } = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of importsOf(file)) {
      if (spec.startsWith('node:')) {
        return [...trail, spec].map((f) => path.relative(ROOT, f).replaceAll('\\', '/')).join('\n  -> ');
      }
      const next = resolve(file, spec);
      if (next) stack.push({ file: next, trail: [...trail, next] });
    }
  }
  return undefined;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.ts') || e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

describe('client scripts stay browser-safe', () => {
  const scripts = walk(path.join(ROOT, 'src', 'scripts'));

  it('finds the client scripts at all, so this cannot pass vacuously', () => {
    expect(scripts.length).toBeGreaterThan(5);
  });

  it.each(scripts.map((f) => [path.relative(ROOT, f).replaceAll('\\', '/'), f] as const))(
    '%s reaches no Node builtin',
    (_label, file) => {
      const trail = nodeBuiltinReachableFrom(file);
      expect(
        trail,
        trail &&
          `A browser bundle would import a Node builtin through this chain:\n  ${trail}\n\n` +
            `Vite externalises it and the stub throws at import time, which kills every handler in ` +
            `that entry point. Split the part the client needs into its own Node-free module.`,
      ).toBeUndefined();
    },
  );

  it('detects a violation when one exists', () => {
    // Mutation check baked in: customer/auth.ts genuinely does import node:crypto, so if the walker
    // ever stopped working the suite above would go quietly green. This proves it still bites.
    const trail = nodeBuiltinReachableFrom(path.join(ROOT, 'src', 'lib', 'customer', 'auth.ts'));
    expect(trail).toBeDefined();
    expect(trail).toContain('node:crypto');
  });
});
