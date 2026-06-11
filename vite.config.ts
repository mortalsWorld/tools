import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import path from 'node:path'

export default defineConfig({
    plugins: [
        react(),
        electron([
            {
                entry: 'electron/main.ts',
                onstart(options) {
                    options.startup()
                },
            },
            {
                entry: 'electron/preload.ts',
                onstart(options) {
                    options.reload()
                },
            }
        ])
    ],
    base: './',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },
    build: {
        outDir: 'dist',
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ['react', 'react-dom'],
                    utils: ['lodash']
                }
            }
        }
    }
})
