import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // so you can open it from your phone on the same wifi
    // 5173 is the only origin registered on the Google OAuth client, so refuse to
    // start elsewhere rather than silently drifting to a port sign-in will reject.
    port: 5173,
    strictPort: true,
  },
});
