import { readFile } from "node:fs/promises";
import ts from "typescript";

// Compile the actual source graph in memory. Server-only markers may be
// replaced ONLY when the caller explicitly selects server-module testing.
async function moduleUrl(url, options) {
  const source = await readFile(url, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: url.pathname,
    reportDiagnostics: true,
  });
  const errors = compiled.diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error) ?? [];
  if (errors.length > 0) throw new Error(`Billing test compilation failed for ${url.pathname}`);
  let output = compiled.outputText;
  const imports = [...output.matchAll(/(?:from\s+|import\s*)(["'])([^"']+)\1/g)];
  for (const [, quote, specifier] of imports) {
    let dependency;
    if (specifier === "server-only") {
      if (!options.serverOnly) throw new Error("Server module testing must be explicitly enabled");
      dependency = "data:text/javascript,export{}";
    } else if (specifier.startsWith("@/")) {
      dependency = await moduleUrl(new URL(`../../src/${specifier.slice(2)}.ts`, import.meta.url), options);
    } else if (specifier.startsWith(".")) {
      dependency = await moduleUrl(new URL(`${specifier}.ts`, url), options);
    } else {
      dependency = import.meta.resolve(specifier);
    }
    output = output.replaceAll(`${quote}${specifier}${quote}`, JSON.stringify(dependency));
  }
  return `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
}

export async function importTypeScript(url, options = {}) {
  return import(await moduleUrl(url, options));
}
