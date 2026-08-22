export async function loadArtifact<T>(name: string): Promise<T> {
  const res = await fetch(`/artifacts/${name}`, { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`Failed to load artifact: ${name}`);
  }
  return res.json() as Promise<T>;
}

export async function loadArtifactServer<T>(name: string): Promise<T> {
  const { readFile } = await import("fs/promises");
  const { join } = await import("path");
  const file = join(process.cwd(), "public", "artifacts", name);
  const raw = await readFile(file, "utf-8");
  return JSON.parse(raw) as T;
}
