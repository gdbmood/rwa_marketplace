# Deployment State Audit

Audit date: 2026-09-03. Scope: where the Fractionnaire RWA marketplace is actually deployed today, what is reachable publicly, and what the Moods Vercel account can and cannot control.

## Summary verdict

The only live deployment of this app is the legacy build at https://desert-tech-rwa-marketplace.vercel.app, and it is hosted on a Vercel account that the Moods team does not control. The Moods Vercel team (slug `moods`, id `team_LrSHE3MDpIVHX6AU7h39dlum`) contains no project for this app at all. The brand domains fractionnaire.com and fractionaire.com are registered but parked at GoDaddy and serve no application. The new Next.js 15 repo at `/Users/gdbmood/Desktop/Fractionnaire/rwa_marketplace` has never been deployed anywhere (no `.vercel/` directory, no `vercel.json`, no CI workflows).

## 1. Vercel account state (Moods team)

Checked via the Vercel MCP integration on 2026-09-03.

- `list_teams` returns exactly one team for this account: Moods, slug `moods`, id `team_LrSHE3MDpIVHX6AU7h39dlum`, plan `pro`. There is no other team or personal scope that could be hiding the project.
- `list_projects` for that team returns 50 projects (the tool maximum). None match `rwa`, `fraction`, `desert`, or `marketplace`. The inventory is dominated by `sitelab-*` projects plus unrelated ones (`the-wine-caveau`, `polymarket-arbitrage`, `rumoo`, `rumoo-official`, `rumoo-social-auth`, `loomere`, `urano-u-dapp`, `mgs_website_3_0`, `ludi-job-radar`, `sitelab-backoffice`, `sitelab-questionnaire`, `sitelab-ambassador-platform`, `aura-roasters-qo`).
- `get_deployment` for `desert-tech-rwa-marketplace.vercel.app` scoped to `team_LrSHE3MDpIVHX6AU7h39dlum` returns HTTP 404, `{"error":{"code":"not_found","message":"Deployment not found"}}`.

Conclusion: the production Vercel project for this app is not accessible from this account. It lives on some other Vercel account, almost certainly one owned by the outsourced Desert Tech team. Supporting evidence: the legacy repos all point at the GitHub org `DesertTechProjects` (`git -C /Users/gdbmood/Desktop/Fractionnaire/legacy/rwa_marketplace remote -v` shows `https://github.com/DesertTechProjects/rwa_marketplace.git`), and the deployment hostname `desert-tech-rwa-marketplace.vercel.app` follows Vercel's `<project>-<scope>` naming with a Desert Tech prefix.

Practical consequence: from the Moods account there is no way to redeploy, roll back, pause, read logs, read env vars, or attach domains for the live site. Taking ownership requires either a project transfer from the Desert Tech Vercel account or standing up a fresh project under `moods` and repointing DNS.

## 2. The live legacy deployment

URL: https://desert-tech-rwa-marketplace.vercel.app

- Status: up and healthy. `curl -I` returns HTTP/2 200, `server: Vercel`, `x-powered-by: Next.js`, HSTS enabled. Served from Vercel edge (`x-vercel-id: fra1::iad1::...`). DNS resolves to Vercel anycast IPs 216.198.79.3 and 64.29.17.3.
- The response `link` header exposes the active deployment id `dpl_ENZWswKnrLZTS2sUuK9sdNrUHgNo` (visible in the CSS preload URL query `?dpl=...`).
- Landing page content (fetched 2026-09-03): Fractionnaire branding, headline "Turn physical assets into liquid investments" and "Bridging Reality and Blockchain", featured tokenized assets (a 0.40 carat yellow diamond, a BlueStone Diamond, penthouses in Monaco and New York), marketing stats ($2 million+ tokenized, 2400+ businesses, 24% average ROI), sections on asset classes and multicurrency payments, footer with an Abu Dhabi address. No error screens, no auth wall, no 404.
- Route probe results (HTTP status codes):
  - `/` 200
  - `/marketplace` 200
  - `/portfolio` 200 (linked from the marketplace page)
  - `/login`, `/signup`, `/signin`, `/register`, `/auth/login`, `/auth/signin`, `/dashboard`, `/assets`, `/blog`, `/api/health` all 404. Auth in the legacy stack is wallet and modal driven (Thirdweb plus Firebase), so the absence of dedicated auth pages is consistent with the legacy codebase rather than a breakage signal.
- The deployed code corresponds to the legacy repo, whose last commit is `160cd44` dated 2025-09-01 (`git -C /Users/gdbmood/Desktop/Fractionnaire/legacy/rwa_marketplace log -1`). The live site is therefore roughly a year stale relative to today and predates the Supabase migration work entirely.

## 3. Brand domains

All checks run 2026-09-03 with dig, curl, and whois.

| Domain | DNS | What it serves |
| --- | --- | --- |
| fractionnaire.com | A 15.197.148.33, 3.33.130.190 (GoDaddy parking anycast) | HTTP 200 with a 114 byte stub that JS-redirects to `/lander`, which is the GoDaddy parking lander (`window._trfd.push({ap:"parking"})`, assets from img1.wsimg.com/parking-lander) |
| www.fractionnaire.com | CNAME to fractionnaire.com | TLS handshake fails with `tlsv1 unrecognized name` (no certificate for the www hostname), so the www variant is effectively broken over HTTPS |
| fractionaire.com | A 15.197.148.33, 3.33.130.190 | Same GoDaddy parking lander |
| www.fractionaire.com | CNAME to fractionaire.com | Serves the same parking stub |

Whois for both spellings: registered 2020-11-16 at GoDaddy.com LLC, nameservers NS05/NS06.DOMAINCONTROL.COM (GoDaddy default), registry expiry 2026-11-16.

Conclusions:

- No newer production deployment exists publicly on the brand domains. Neither domain points at Vercel or at any app.
- Both domains expire on 2026-11-16, about ten weeks from the audit date. If they matter to the launch, renewal should be confirmed with whoever controls the GoDaddy account.
- The GitHub remote of the new repo uses the single-n spelling org (`https://github.com/fractionaire/rwa_marketplace.git`), while the product name and primary domain use the double-n spelling. Both spellings are registered, which mitigates typo risk, but a canonical choice is needed before wiring DNS.

## 4. Deployment readiness of the target repo

Repo: `/Users/gdbmood/Desktop/Fractionnaire/rwa_marketplace`, branch `feat/supabase-migration-onramp-e2e`, remote `https://github.com/fractionaire/rwa_marketplace.git`, last commit `175b934` dated 2026-09-03.

- No `.vercel/` directory and no `vercel.json` in the repo root (verified by listing; same is true of the legacy repo). The app has never been linked to any Vercel project from this working copy.
- No `.github/` directory, so no CI or deploy workflows exist.
- No references to `desert-tech`, `vercel.app`, `fractionnaire.com`, or `fractionaire.com` anywhere in the target repo or the legacy repos (repo-wide grep, node_modules excluded). The old deployment is not documented in code.
- Standard Next.js build scripts are present (`build: next build`, `start: next start` in `/Users/gdbmood/Desktop/Fractionnaire/rwa_marketplace/package.json` lines 7 and 9), so a Vercel deployment needs no custom build config.
- Environment surface a new deployment must provision, from `/Users/gdbmood/Desktop/Fractionnaire/rwa_marketplace/.env.example` lines 1 to 28: Thirdweb client id and secret (lines 2, 4), the full Firebase client config plus admin credentials (lines 7 to 15), `JWT_SECRET` (line 17), Thirdweb chain id and contract address (lines 19, 20), Sumsub KYC token and secret (lines 22, 23), blockchain explorer URL and USDC contract address (lines 25, 26), and `AUTH_PRIVATE_KEY` (line 28). Note: this `.env.example` was restored from the legacy repo (commit message of `175b934`), so it reflects the legacy Firebase stack. Any Supabase variables introduced by the migration branch are not yet represented in it, which a reviewer should treat as a documentation gap when provisioning a new environment.

## 5. What a reviewer needs to know

1. Today, the only public deployment of this product is the legacy Desert Tech build at desert-tech-rwa-marketplace.vercel.app. It is up, serving the marketing landing page, `/marketplace`, and `/portfolio` without visible errors, but it runs code frozen around 2025-09-01.
2. That deployment is hosted outside the Moods Vercel account. The Moods team (its only team) has no rwa, fraction, desert, or marketplace project, and the Vercel API confirms the deployment is not found under the Moods team id. Moods currently has zero operational control over the live site (no redeploy, no rollback, no logs, no env access, no domain management, no ability to take it down).
3. The brand domains (both spellings) are GoDaddy-parked, serve no app, and expire 2026-11-16. The www subdomain of the primary spelling has a broken TLS configuration even for the parking page.
4. The new repo is not deployed anywhere and has no deployment wiring (no Vercel link, no CI). Shipping it requires creating a fresh Vercel project under the Moods team (or another chosen host), provisioning the env vars listed above plus the Supabase ones, and pointing fractionnaire.com DNS away from GoDaddy parking.
5. Open questions for the team: who holds the Desert Tech Vercel account and the GoDaddy account, whether the legacy deployment should be taken down or redirected at cutover (it exposes the old app publicly with real-looking asset listings), and which domain spelling is canonical.
