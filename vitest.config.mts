import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    // Yalnızca birim/entegrasyon testleri. e2e/ klasörü Playwright'ın;
    // dışarıda bırakılmazsa Vitest onun spec dosyasını da toplamaya çalışır
    // ve "test.beforeAll() burada çağrılamaz" hatasıyla düşer.
    include: ["test/**/*.test.ts"],
    // PGlite testleri migration'ları sıfırdan uyguluyor; ilk açılış birkaç saniye sürer.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
