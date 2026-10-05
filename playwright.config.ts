import { defineConfig, devices } from "@playwright/test";
import { config as envYukle } from "dotenv";

// E2E gerçek Supabase projesine bağlanıyor; anahtarlar .env.local'dan gelir.
envYukle({ path: ".env.local", quiet: true });

// E2E ÜRETİM DERLEMESİNE karşı koşar, geliştirme sunucusuna değil.
// Sebep: `next dev` sayfanın üzerine bir geliştirme katmanı bindiriyor ve bu
// katman tıklamaları yutuyor (Playwright "html intercepts pointer events"
// diyor). Ayrıca sahaya çıkan şey üretim derlemesi; test edilmesi gereken o.
// Ayrı port, 3000'deki geliştirme sunucusunu bozmamak için.
const PORT = process.env.E2E_PORT ?? "3100";
const ADRES = process.env.E2E_ADRES ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Testler aynı okulun verisini sırayla değiştiriyor (rezerve → iptal →
  // yükseltme). Paralel koşsalardı birbirlerinin durumunu bozarlardı.
  fullyParallel: false,
  workers: 1,
  // Ağ gecikmesi yüzünden tek bir yeniden deneme; ikincisi hatayı gizlemeye başlar.
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: ADRES,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "masaustu", use: { ...devices["Desktop Chrome"] } },
    // Öğrenci ve veli uygulamaya telefondan girecek; kabuk orada da çalışmalı.
    { name: "mobil", use: { ...devices["Pixel 7"] } },
  ],

  webServer: {
    command: `next build && next start -p ${PORT}`,
    url: ADRES,
    // Aynı port zaten dinleniyorsa yeniden derleme; ardışık koşularda hızlı.
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
