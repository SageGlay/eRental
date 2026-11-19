# Local setup and testing

## Open the application folder

On your Windows computer, open PowerShell in the folder that contains the application:

```powershell
cd 'C:\path\to\erental-foundation\erental'
Get-ChildItem package.json, vite.config.js, src, public, supabase
```

Replace `C:\path\to` with your actual folder location. The important check is that **this folder contains `package.json`**. Do not run npm from the outer `erental-foundation` folder. In the cloud checkout used for development, the corresponding application folder is `/workspace/eRental`.

## Required software

- Node.js 22 or newer, with npm; Node 24.22.1 and npm 11.9.0 were validated.
- Git if you download/update the project through GitHub.
- A current browser and a text editor such as VS Code.
- Your existing Supabase project settings. Do not create another project.

Check the software:

```powershell
node --version
npm.cmd --version
```

`npm.cmd` works in PowerShell even when its execution policy blocks the `npm.ps1` wrapper.

## Install dependencies

```powershell
npm.cmd ci
```

This uses `package-lock.json`. Do not delete the lockfile as a routine troubleshooting step. Installed dependencies include React, React Router, Supabase JS, Vite and Playwright.

## Environment settings

The existing Supabase client expects exactly these names:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Keep an existing working `.env` file. If no local file exists and values are not supplied by your development environment:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
code .env
```

Enter the existing project's URL and **public publishable/anon key** privately. Never put a service-role key, secret key or database password in a `VITE_` variable. Vite makes these frontend variables visible in the browser bundle. Do not paste `.env` contents into chat, screenshots or GitHub. The file is ignored by Git.

Restart Vite after changing settings. Missing or incorrect settings must not be “fixed” by inventing credentials or disabling RLS.

## Start, open and stop the app

```powershell
npm.cmd run dev -- --port 5173 --strictPort
```

Open `http://localhost:5173/` in your browser on that same computer. Keep PowerShell running while using the website. Press **Ctrl+C** in that terminal to stop the server.

The cloud instance also successfully started with:

```sh
cd /workspace/eRental
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

Vite reported `http://localhost:5173/`. This is an address inside the running machine, not a published website. Run the PowerShell command locally to use the app on your own computer.

## Build and browser regression tests

```powershell
npm.cmd run build
npm.cmd run preview -- --port 4173 --strictPort
```

Preview serves the built files at `http://localhost:4173/`. It does not rebuild automatically after source changes. Stop it with Ctrl+C.

```powershell
npx.cmd playwright install chromium
npm.cmd test
```

The test runner starts a separate Vite server on port **4174**, injects fictional Supabase settings and intercepts API requests. It does not use your real Supabase accounts or write production data. Keep port 4174 free. On Linux, install Playwright's browser system dependencies if Chromium reports missing shared libraries (`npx playwright install --with-deps chromium` on a machine where system installation is permitted). An installed `/usr/bin/chromium` is used automatically when present.

## Confirm the real Supabase connection

1. Start Vite with the real local settings and open the homepage.
2. Open browser Developer Tools → Network. Refresh and locate the categories/listings requests sent to your Supabase project.
3. Confirm they complete successfully and the page shows the corresponding categories/listings or an honest empty state. A running Vite server alone does not confirm backend connectivity.
4. Use a designated test account for login/profile checks. Do not alter another user's listing or booking merely to demonstrate the app.
5. Check that authenticated requests use the current user session and failures are reported. Do not share request headers, authorization tokens or private response data.

The current cloud environment has both required variable bindings, but the network proxy rejects the project's hostname with a tunnel **403 Forbidden**. This is an environment connectivity blocker; it is not proof that your Supabase credentials, tables or policies are wrong. Allow the configured Supabase hostname in the cloud environment's network settings before repeating live checks. Do not disable TLS or RLS. The local frontend and fixture tests still run while that live connection is blocked.

## Common errors

| Symptom | Fix |
| --- | --- |
| `package.json` / ENOENT error | Change to the inner application folder and verify `Get-ChildItem package.json` |
| `npm` not recognized | Install/reinstall Node.js, then open a new PowerShell window |
| `npm.ps1 cannot be loaded` | Use the `npm.cmd`/`npx.cmd` commands above; no execution-policy change is necessary |
| `vite` or module not found | Run `npm.cmd ci` in the application folder |
| Port 5173 is already in use | Stop the Vite process in its original terminal, or choose `--port 5175 --strictPort` and open that address |
| Port 4174 in use during tests | Stop the process using that test port; the runner intentionally refuses to reuse an unknown server |
| “Supabase is not configured” | Check the two variable names, put the existing project's public values in local settings, and restart Vite |
| API 401/403 in the browser | Distinguish proxy denial from Supabase responses; check connectivity/session/project settings. Do not grant public access to private tables or buckets |
| New page refresh works locally but 404s after hosting | Configure the static host's SPA fallback to `index.html` |
| Chromium executable missing | Run `npx.cmd playwright install chromium`, or configure `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed Chromium binary |
| Fonts do not download | System-font fallbacks are already configured; this does not establish a Supabase failure |

## Verification frontend and contract

My profile links to `/verification`; the existing admin area links to `/admin/verification`. Follow [VERIFICATION_TESTING.md](VERIFICATION_TESTING.md) for regular-user, business-user and administrator walkthroughs.

The project owner supplied the applied verification contract, now recorded in `supabase/contracts/verification.json`. No replacement project or migration deployment is required to use those existing endpoints. A separate, **undeployed** RPC-hardening proposal addresses concurrent review/profile changes; review and test it before production use. Live connection/security checks still require the Supabase hostname to be reachable.

## eRental 3.0 password recovery and screenshot checks

Use a designated staging project and a consenting test mailbox to exercise recovery delivery. In Supabase Authentication → URL Configuration, allow the exact callback for the deployed origin, for example `http://localhost:5173/reset-password` for local Vite. Configure the standard recovery email to use the Supabase confirmation link. The app expects the implicit recovery callback from that link. Keep session tokens and received links out of issue reports. Direct visits to `/reset-password` without a recovery callback offer a fresh link.

To reproduce the redesign screenshots with fictional API responses, run the fixture matrix with an output directory outside the repository.

```powershell
$env:ERENTAL_SCREENSHOT_DIR = Join-Path $env:TEMP 'erental-v3-screens'
npx playwright test tests/e2e/redesign.spec.js
Remove-Item Env:ERENTAL_SCREENSHOT_DIR
```

The full browser suite remains `npm test`. The separate `npm run test:db` requires Docker and runs the verification contract in disposable local PostgreSQL. [Redesign handoff](ERENTAL_3_HANDOFF.md)
