import { describe, it, expect } from "vitest";
import { createTestDb, listMigrations } from "./db";

describe("veritabani semasi", () => {
  it("tum migration dosyalari hatasiz calisir", async () => {
    const files = await listMigrations();
    expect(files.length).toBeGreaterThan(0);
    const db = await createTestDb();
    const { rows } = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
       order by table_name`
    );
    console.log("tablolar:", rows.map((r) => r.table_name).join(", "));
    expect(rows.length).toBeGreaterThan(20);
    await db.close();
  }, 120000);
});
