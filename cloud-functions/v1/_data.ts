import { constants } from "fs";
import { access, readFile } from "fs/promises";
import { join } from "path";

type GetOptions = { type: "json" } | { type: "text" };

/**
 * 候选 data 根目录：
 * 1. 官方相对路径：源码在 cloud-functions/v1 时对应 ../../data
 * 2. cwd 为项目根时的 data/
 * 3. 部署产物：api-node/included_files/data（EdgeOne 注入 __dirname）
 *
 * 不能用 import.meta.url：打包后指向 index.mjs，会解析到错误位置。
 */
function getDataRootCandidates(): string[] {
  const roots = [join("..", "..", "data"), "data", join(process.cwd(), "data")];

  const dirname = (globalThis as { __dirname?: string }).__dirname;
  if (dirname) {
    roots.push(join(dirname, "included_files", "data"));
  }
  roots.push(join(process.cwd(), "included_files", "data"));

  return roots;
}

let cachedDataRoot: string | null = null;

async function resolveDataRoot(): Promise<string> {
  if (cachedDataRoot) {
    return cachedDataRoot;
  }

  const probe = join("sharded_data", "index.json");
  for (const root of getDataRootCandidates()) {
    try {
      await access(join(root, probe), constants.R_OK);
      cachedDataRoot = root;
      return root;
    } catch {
      // try next
    }
  }

  cachedDataRoot = join("..", "..", "data");
  return cachedDataRoot;
}

/**
 * 从 data/ 目录读取文件。
 * 路径相对于 data/，例如 `sharded_data/pet/id-index.json`。
 */
export async function getData(
  relativePath: string,
  options: { type: "json" },
): Promise<any | null>;
export async function getData(
  relativePath: string,
  options: { type: "text" },
): Promise<string | null>;
export async function getData(
  relativePath: string,
  options: GetOptions = { type: "json" },
): Promise<any | null> {
  const filePath = join(await resolveDataRoot(), relativePath);
  try {
    const text = await readFile(filePath, "utf-8");
    if (options.type === "text") {
      return text;
    }
    return JSON.parse(text);
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ENOENT"
    ) {
      return null;
    }
    throw err;
  }
}
