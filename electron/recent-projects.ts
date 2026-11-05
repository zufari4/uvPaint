import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { basename, isAbsolute, normalize } from "node:path";
import { randomUUID } from "node:crypto";

type Entry = { id: string; path: string };
export class RecentProjects {
  private entries: Entry[] = [];
  private writes: Promise<void> = Promise.resolve();
  constructor(private file: string) {}
  private key(path: string) { return process.platform === "win32" ? normalize(path).toLowerCase() : normalize(path); }
  async load() {
    try {
      const data: unknown = JSON.parse(await readFile(this.file, "utf8"));
      if (!Array.isArray(data)) return;
      const paths = new Set<string>(), ids = new Set<string>();
      this.entries = data.filter((entry): entry is Entry => {
        if (!entry || typeof entry.id !== "string" || typeof entry.path !== "string" || !isAbsolute(entry.path)) return false;
        const key = this.key(entry.path);
        if (paths.has(key) || ids.has(entry.id)) return false;
        paths.add(key);ids.add(entry.id);return true;
      }).slice(0, 10);
    } catch { this.entries = []; }
  }
  list() { return this.entries.map(entry => ({ ...entry, name: basename(entry.path) })); }
  path(id: unknown) {
    const entry = this.entries.find(entry => entry.id === id);
    if (!entry) throw new Error("Unknown recent project. Use Open project.");
    return entry.path;
  }
  async remember(path: string) {
    const key = this.key(path), existing = this.entries.find(entry => this.key(entry.path) === key);
    this.entries = [{ id: existing?.id ?? randomUUID(), path }, ...this.entries.filter(entry => this.key(entry.path) !== key)].slice(0, 10);
    const json = JSON.stringify(this.entries);
    this.writes = this.writes.then(async () => {
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, json, { flag: "wx" });
        await rename(temporary, this.file);
      } catch (error) {
        await unlink(temporary).catch(() => {});
        // A recent-list write failure must not invalidate a successful project save/open.
        console.warn("Could not save recent projects", error);
      }
    });
    await this.writes;
  }
}
