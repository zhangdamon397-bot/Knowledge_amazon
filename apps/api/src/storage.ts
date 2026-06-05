import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";

export interface StoredFile {
  storagePath: string;
  size: number;
}

export interface StorageService {
  save(buffer: Buffer, filename: string): Promise<StoredFile>;
  read(storagePath: string): Promise<Buffer>;
  remove(storagePath: string): Promise<void>;
}

export class LocalStorageService implements StorageService {
  private readonly rootDir = path.resolve(loadConfig().uploadDir);

  async save(buffer: Buffer, filename: string): Promise<StoredFile> {
    await mkdir(this.rootDir, { recursive: true });
    const safeName = filename.replace(/[^\w.\-\u4e00-\u9fff]+/g, "_");
    const storagePath = path.join(this.rootDir, `${randomUUID()}-${safeName}`);
    await writeFile(storagePath, buffer);
    return {
      storagePath,
      size: buffer.byteLength
    };
  }

  async read(storagePath: string): Promise<Buffer> {
    return readFile(storagePath);
  }

  async remove(storagePath: string): Promise<void> {
    await rm(storagePath, { force: true });
  }
}
