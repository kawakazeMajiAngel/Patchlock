import { readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { parsePatchText } from "./src/data/parsePatchText";
import { isPatch } from "./src/data/validation";
import type { BalanceAssessment } from "./src/types/patch";

type PatchIndex = {
  schemaVersion: 1;
  patchFiles: string[];
};

type GeneratedPatchnoteAssets = {
  assets: Map<string, string>;
  sourcePathsByPatchId: Map<string, string>;
  sourceLineIdsByPatchId: Map<string, Set<string>>;
};

type AssessmentUpdate = {
  sourceLineId: string;
  assessment: BalanceAssessment;
};

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

const balanceAssessments: BalanceAssessment[] = [
  "buff",
  "nerf",
  "adjust",
  "unrated",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAssessmentUpdate(value: unknown): value is AssessmentUpdate {
  return (
    isRecord(value) &&
    typeof value.sourceLineId === "string" &&
    /^source-\d+$/.test(value.sourceLineId) &&
    typeof value.assessment === "string" &&
    balanceAssessments.includes(value.assessment as BalanceAssessment)
  );
}

function isAssessmentSaveRequest(
  value: unknown,
): value is { patchId: string; changes: AssessmentUpdate[] } {
  return (
    isRecord(value) &&
    typeof value.patchId === "string" &&
    Array.isArray(value.changes) &&
    value.changes.length > 0 &&
    value.changes.every(isAssessmentUpdate) &&
    new Set(value.changes.map(({ sourceLineId }) => sourceLineId)).size ===
      value.changes.length
  );
}

async function generatePatchnoteAssets(): Promise<GeneratedPatchnoteAssets> {
  const patchnoteDirectory = resolve(projectRoot, "patchnote");
  const entries = await readdir(patchnoteDirectory, { withFileTypes: true });
  const textFiles = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        !entry.name.startsWith(".") &&
        (extname(entry.name) === "" ||
          [".txt", ".text"].includes(extname(entry.name).toLowerCase())),
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  const patchFiles: string[] = [];
  const assets = new Map<string, string>();
  const sourcePathsByPatchId = new Map<string, string>();
  const sourceLineIdsByPatchId = new Map<string, Set<string>>();
  const patchIds = new Set<string>();

  for (const entry of textFiles) {
    const sourcePath = join(patchnoteDirectory, entry.name);
    const rawText = await readFile(sourcePath, "utf8");
    if (!rawText.trim()) {
      throw new Error(`${sourcePath}: パッチノートが空です。`);
    }

    const sourceName = entry.name.replace(/\.[^.]+$/, "");
    const dateMatch = sourceName.match(/(?:^|[_-])(\d{4})(\d{2})(\d{2})$/);
    const dateText = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : undefined;
    const isValidDate =
      dateText &&
      !Number.isNaN(Date.parse(`${dateText}T00:00:00Z`)) &&
      new Date(`${dateText}T00:00:00Z`).toISOString().slice(0, 10) === dateText;
    if (dateText && !isValidDate) {
      throw new Error(`${sourcePath}: ファイル名の日付が不正です。`);
    }

    const { patch, warnings } = parsePatchText(
      rawText,
      sourceName,
      isValidDate ? dateText : undefined,
    );

    if (!isPatch(patch)) {
      throw new Error(`${sourcePath}: 生成したパッチがスキーマVersion 1に適合しません。`);
    }
    if (patch.changeGroups.length === 0) {
      throw new Error(`${sourcePath}: 変更内容を解析できませんでした。`);
    }
    if (patchIds.has(patch.id)) {
      throw new Error(`${sourcePath}: パッチID「${patch.id}」が重複しています。`);
    }
    patchIds.add(patch.id);
    sourcePathsByPatchId.set(patch.id, sourcePath);
    sourceLineIdsByPatchId.set(
      patch.id,
      new Set(patch.sourceLines.map(({ id }) => id)),
    );
    if (warnings.length > 0) {
      for (const warning of warnings) {
        console.warn(`${sourcePath}: ${warning}`);
      }
    }

    const fileName = `${patch.id}.json`;
    patchFiles.push(fileName);
    assets.set(fileName, `${JSON.stringify(patch, null, 2)}\n`);
  }

  const index: PatchIndex = { schemaVersion: 1, patchFiles };
  assets.set("index.json", `${JSON.stringify(index, null, 2)}\n`);
  return { assets, sourcePathsByPatchId, sourceLineIdsByPatchId };
}

function patchnotePlugin(): Plugin {
  return {
    name: "generate-patchnote-json",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(
          request.url ?? "/",
          "http://localhost",
        ).pathname;
        if (/(?:^|\/)__dev\/patch-assessments$/.test(pathname)) {
          if (request.method !== "POST") {
            response.statusCode = 405;
            response.setHeader("Allow", "POST");
            response.end("Method Not Allowed");
            return;
          }

          try {
            let body = "";
            for await (const chunk of request) {
              body += chunk.toString();
              if (body.length > 1024 * 1024) {
                response.statusCode = 413;
                response.end("Request body is too large.");
                return;
              }
            }

            let value: unknown;
            try {
              value = JSON.parse(body);
            } catch {
              response.statusCode = 400;
              response.end("Invalid JSON request.");
              return;
            }
            if (!isAssessmentSaveRequest(value)) {
              response.statusCode = 400;
              response.end("Invalid assessment update.");
              return;
            }

            const generated = await generatePatchnoteAssets();
            const sourcePath = generated.sourcePathsByPatchId.get(value.patchId);
            const validSourceLineIds =
              generated.sourceLineIdsByPatchId.get(value.patchId);
            if (!sourcePath || !validSourceLineIds) {
              response.statusCode = 404;
              response.end("Patch not found.");
              return;
            }
            if (
              value.changes.some(
                ({ sourceLineId }) => !validSourceLineIds.has(sourceLineId),
              )
            ) {
              response.statusCode = 400;
              response.end("Source line not found in patch.");
              return;
            }

            const original = await readFile(sourcePath, "utf8");
            const newline = original.includes("\r\n") ? "\r\n" : "\n";
            const lines = original.split(/\r?\n/);
            for (const { sourceLineId, assessment } of value.changes) {
              const lineNumber = Number(sourceLineId.slice("source-".length));
              const line = lines[lineNumber - 1];
              if (line === undefined) {
                response.statusCode = 400;
                response.end("Source line is outside the patch file.");
                return;
              }
              const withoutAssessment = line
                .replace(/\s*\[BalanceAssessment:[^\]]*(?:\]|$)/g, "")
                .trimEnd();
              lines[lineNumber - 1] =
                assessment === "unrated"
                  ? withoutAssessment
                  : `${withoutAssessment} [BalanceAssessment:"${assessment}"]`;
            }

            const temporaryPath = `${sourcePath}.${randomUUID()}.tmp`;
            try {
              await writeFile(temporaryPath, lines.join(newline), {
                encoding: "utf8",
                flag: "wx",
              });
              await rename(temporaryPath, sourcePath);
            } finally {
              await rm(temporaryPath, { force: true });
            }

            response.statusCode = 200;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ saved: value.changes.length }));
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "アセスメントを保存できませんでした。";
            server.config.logger.error(message);
            response.statusCode = 500;
            response.end("Unable to save assessments.");
          }
          return;
        }

        const fileName = pathname.match(/(?:^|\/)data\/patches\/([^/]+)$/)?.[1];
        if (!fileName) {
          next();
          return;
        }

        try {
          const generated = await generatePatchnoteAssets();
          const contents = generated.assets.get(fileName);
          if (contents === undefined) {
            next();
            return;
          }
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(contents);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "パッチノートを変換できませんでした。";
          server.config.logger.error(message);
          response.statusCode = 500;
          response.end(message);
        }
      });
    },
    async generateBundle() {
      const { assets } = await generatePatchnoteAssets();
      for (const [fileName, source] of assets) {
        this.emitFile({
          type: "asset",
          fileName: `data/patches/${fileName}`,
          source,
        });
      }
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [patchnotePlugin(), react()],
});
