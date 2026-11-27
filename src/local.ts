import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AtlasError } from './core/errors.ts';
import { SKIPPED_DIRECTORIES } from './core/find.ts';
import type { Source } from './core/scan.ts';

/** A local checkout as a repository: named after its directory, linked with file:// URLs. */
export async function openDirectory(input: string): Promise<Source> {
  const root = resolve(input);
  const name = basename(root);
  let paths: string[];
  try {
    paths = await walk(root, '');
  } catch {
    throw new AtlasError(`Not a GitHub URL or a readable directory: ${input}`);
  }
  return {
    repository: { id: name, organization: 'local', name, url: pathToFileURL(root).href, commit: '' },
    paths,
    warnings: [],
    read: (path) => readFile(join(root, path)).then((bytes) => new Uint8Array(bytes), () => undefined),
  };
}

/** Every regular file under the directory, as a path relative to the root. */
async function walk(root: string, directory: string, paths: string[] = []): Promise<string[]> {
  // One list for the whole walk: a large repository has more files than a spread can pass.
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) await walk(root, path, paths);
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}

/** A saved skill-atlas file's text. */
export function readTextFile(path: string): Promise<string> {
  return readFile(path, 'utf8').catch((error: Error) => {
    throw new AtlasError(`Cannot read ${path}: ${error.message}`);
  });
}

/** Written next to the file, then renamed over it: a failed write leaves the old file whole. */
export async function writeTextFile(path: string, text: string): Promise<void> {
  try {
    await mkdir(dirname(resolve(path)), { recursive: true });
    await writeFile(`${path}.partial`, text);
    await rename(`${path}.partial`, path);
  } catch (error) {
    throw new AtlasError(`Cannot write ${path}: ${(error as Error).message}`);
  }
}
