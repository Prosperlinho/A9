# Hackathon log

- **Project:** A9
- **Event:** Convex All Gas Hackathon
- **What it does:** Authenticated, real-time campus ride booking for students and riders in Ebonyi State, Nigeria.
- **Live app:** https://dazzling-grouse-142.convex.site
- **Repo:** none
- **Frontend:** Convex static hosting
- **Convex deployment:** Development deployment with public static hosting
- **Components:** Convex Static Hosting
- **Convex features:** Convex Auth, role-aware queries and mutations, indexed rides, coordinate-bearing bookings, wallet transactions, funding requests
- **Auth:** Convex Auth password provider
- **AI models:** none
- **Started:** 2026-09-02T14:11:05Z
- **Last updated:** 2026-09-05T02:00:00Z

## Log

### 2026-09-02 - working tree
Initialized the hackathon build log before application development. No application code or Convex features exist yet.

### 2026-09-02 - working tree
Built the A9 responsive MVP surface with student booking, fare estimation, rider request handling, admin live activity, and wallet balance views. Added Convex schema and indexed functions for users, campus locations, rides, status transitions, and wallet transactions in `convex/`.

### 2026-09-04 - working tree
Connected the existing frontend to Convex through the existing provider. The app now upserts the three demo role users, seeds and loads campus locations, creates real rides with a wallet charge, streams open requests and student ride status reactively, allows a rider to accept and progress a ride, and credits rider earnings with a wallet transaction on completion. Completion is idempotent. Verified with `npm run typecheck` and `npm run build`; no deployment or publishing performed. Authentication and production identity are still pending.

### 2026-09-04 - working tree
Completed a local end-to-end smoke test against the configured Convex development deployment: booking reduced the student wallet from $24.80 to $21.55, the request appeared in the rider view, acceptance/start/completion succeeded, the rider saw the completed ride and the student view updated in real time. Development functions were synced with `npx convex dev --once`; nothing was published.

### 2026-09-05 - working tree
Added the official `@convex-dev/static-hosting` component, synced it to the Convex development deployment, and uploaded the production Vite build. The public app is available at https://dazzling-grouse-142.convex.site. Verified that the hosted URL opens, loads Convex campus locations and wallet data, and displays the live completed ride state. Production deployment, authentication, and real-user identity remain unfinished.

### 2026-09-05 - working tree
Replaced demo role switching with Convex Auth password signup/sign-in and permanent Student or Rider account roles. Added authenticated profile editing, secure password changes, role-protected ride operations, a support page instead of public admin navigation, pending wallet funding requests, browser GPS pickup, Ebonyi-focused OpenStreetMap location search, coordinate persistence on new rides, and legacy-location cleanup. Local tests covered student signup/sign-in, rider signup, duplicate-email role rejection, profile update, password change, role dashboards, funding-request behavior, and hosted Convex session restoration. `npm run typecheck`, `npm run build`, and `npx convex dev --once` pass. Payment provider credentials, verified wallet webhooks, production authentication configuration, and production deployment remain unfinished.

### 2026-09-05 - working tree
Verified the official Static Hosting configuration does not support choosing a `convex.site` subdomain; the host remains derived from the Convex deployment name. Ran the supported development deployment upload with `npx @convex-dev/static-hosting upload --build` to `dazzling-grouse-142`, and verified the public URL serves the new authenticated bundle. A future `a9ride.com` connection must use Convex custom-domain attachment plus registrar DNS CNAME/TXT verification and an auth-origin rebind; no custom-domain changes were made.
