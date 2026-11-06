import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Em desenvolvimento, /api é encaminhado à API removendo só o prefixo — igual ao Nginx de produção.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api/": { target: `http://127.0.0.1:${process.env.SIMVIO_DEV_API_PORT ?? 3101}`, rewrite: (p) => p.replace(/^\/api/, "") },
    },
  },
  build: { sourcemap: false },
});
