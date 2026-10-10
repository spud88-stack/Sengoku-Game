import { defineConfig } from 'vite';

// Relative asset paths so the built game works from any sub-path, such as username.github.io/repo-name/.
export default defineConfig({ base: './' });
