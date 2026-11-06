import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
// Registry names carry the style ("Arial Bold Italic (TrueType)"); the family is what CSS needs.
const styles = /\s+(Bold|Italic|Oblique|Regular|Light|Semilight|SemiLight|Semibold|SemiBold|Demibold|DemiBold|Black|Heavy|Thin|Hairline|ExtraLight|Extra Light|UltraLight|ExtraBold|Extra Bold|UltraBold|Medium|Book|Normal)$/i;
export function fontFamilies(names: string[]) {
  const families = new Set<string>();
  for (const name of names)
    for (let part of name.replace(/\s*\([^)]*\)\s*$/, "").split(/\s+&\s+/)) {
      part = part.trim();
      if (!part || part.startsWith("@")) continue;
      // Weight names such as "Franklin Gothic Medium" are often families of their own; the renderer drops unresolvable ones.
      if (!/\s(Bold|Italic|Oblique|Regular)$/i.test(part)) families.add(part);
      while (styles.test(part)) part = part.replace(styles, "");
      if (part) families.add(part.trim());
    }
  return [...families].sort((a, b) => a.localeCompare(b));
}
/** Font families installed for all users and for the current user (Windows only). */
export async function systemFonts() {
  if (process.platform !== "win32") return [];
  const names: string[] = [];
  for (const key of ["HKLM", "HKCU"])
    try {
      const { stdout } = await run("reg", ["query", `${key}\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts`], { windowsHide: true, maxBuffer: 8 << 20 });
      for (const line of stdout.split(/\r?\n/)) {
        const match = /^\s{4}(.+?)\s{4}REG_\w+\s{4}/.exec(line);
        if (match) names.push(match[1]);
      }
    } catch { /* the key may not exist for the current user */ }
  return fontFamilies(names);
}
