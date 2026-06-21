import { defineConfig } from 'vite';

// base: './' でビルド成果物を静的ホスティング/ローカルどちらでも開けるようにする
// server.watch.usePolling: フォルダ名に日本語/全角記号が含まれる環境でも
// ファイル変更を確実に検知してHMRを効かせるためポーリング監視にする
export default defineConfig({
  base: './',
  server: {
    watch: {
      usePolling: true,
      interval: 200,
    },
  },
});
