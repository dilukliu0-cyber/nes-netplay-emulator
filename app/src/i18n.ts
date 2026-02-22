import { ru, type TranslationMap } from "./strings/ru";

type Path = `${keyof TranslationMap & string}.${string}`;

function getValue(path: Path): string {
  const [root, key] = path.split(".") as [keyof TranslationMap, string];
  const section = ru[root] as Record<string, string>;
  return section[key] ?? path;
}

export function t(path: Path): string {
  return getValue(path);
}
