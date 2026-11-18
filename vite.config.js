import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { validateSupabaseConfig } from './src/lib/supabaseConfig.js'

export default defineConfig(({ mode }) => {
  const settings = loadEnv(mode, process.cwd(), 'VITE_SUPABASE_')
  return {
    plugins: [react()],
    // Emit the validated public settings or a static error. Automatic VITE_
    // injection would expose raw settings even if the client rejected them.
    envDir: false,
    define: {
      __ERENTAL_SUPABASE_CONFIG__: JSON.stringify(
        validateSupabaseConfig(settings),
      ),
    },
  }
})
