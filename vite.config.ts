import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
    plugins: [
        react()
    ],
    base: './',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },
    build: {
        outDir: 'dist',
        minify: 'esbuild',
        target: 'es2020',
        cssCodeSplit: true,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        if (id.includes('antd') || id.includes('@ant-design')) {
                            return 'antd';
                        }
                        if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
                            return 'react';
                        }
                        if (id.includes('highlight.js') || id.includes('markdown-it')) {
                            return 'markdown';
                        }
                        if (id.includes('@dnd-kit')) {
                            return 'dndkit';
                        }
                        if (id.includes('@tauri-apps')) {
                            return 'tauri';
                        }
                        if (id.includes('framer-motion')) {
                            return 'motion';
                        }
                        if (id.includes('lucide-react')) {
                            return 'icons';
                        }
                        return 'vendor';
                    }
                }
            }
        }
    }
})
