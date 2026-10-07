# GitHub Actions workflows

The Pages frontend and Cloudflare Worker have independent workflows.
Checks must pass before the corresponding deployment can proceed.

```mermaid
flowchart TD
    PR["PR to main"] --> FRONTEND["Frontend checks"]
    PR --> RELEVANT{"Worker-related files changed?"}
    RELEVANT -->|"Yes"| PRWORKER["Worker checks"]
    RELEVANT -->|"No"| NOTNEEDED["Validate Worker reports success:<br/>validation not needed"]
    FRONTEND --> PRCHECKS{"All applicable checks passed?"}
    PRWORKER --> PRCHECKS
    NOTNEEDED --> PRCHECKS
    PRCHECKS -->|"Yes"| MERGE["PR can merge"]
    PRCHECKS -->|"No"| BLOCK["Merge blocked"]

    MERGE -->|"You or an agent merges it"| MAIN["main updated"]
    MAIN --> PAGES["Pages checks"]
    PAGES -->|"Pass"| SITE["Deploy frontend"]
    PAGES -->|"Fail"| SITEFAIL["No frontend deployment"]
    MAIN --> CHANGED{"Worker source or shared dependencies changed?"}
    CHANGED -->|"No"| SKIP["Worker workflow not triggered"]
    CHANGED -->|"Yes"| WORKER["Worker checks"]
    WORKER -->|"Fail"| APIFAIL["No Worker deployment"]
    WORKER -->|"Pass"| GATE["Production deployment gate"]
    GATE -->|"Allowed"| API["Deploy api Worker"]
    GATE -->|"Waiting or rejected"| HOLD["Worker deployment held or blocked"]

    MP["Manual Pages run"] --> MPC["Pages checks for selected ref"]
    MPC -->|"Pass"| MPD["Deploy selected ref to frontend"]
    MPC -->|"Fail"| MPFAIL["No frontend deployment"]

    MW["Manual Worker run"] --> MWEND["No Worker deployment"]
```

## Checks and deployment gates

- [Pages](deploy.yml): lint, unit tests, and a static production build.
- [Worker](deploy-worker.yml): lint, type-checking, unit tests, and a Wrangler
  dry-run build. The required `Validate Worker` job reports on every PR, but
  runs these checks only for relevant changes. Otherwise, it reports success
  with "Worker validation not needed."
- Relevant PR changes include `workers/weather/**`, the shared
  `app/utils/provider-validation.ts`, `app/utils/weather.ts`, and
  `app/types/weather.ts`, repository dependency/pnpm configuration, ESLint
  configuration, and the Worker workflow itself.
- Failed deployment checks stop that deployment. Neither workflow waits for
  the other workflow after `main` is updated.
- Worker pushes trigger its workflow only when `workers/weather/**` or one of
  those three shared source files changes. Shared source changes also need
  deployment because they are bundled into the Worker. Push and manual runs
  always perform full Worker validation.
- The Worker production gate waits for approval **only if required reviewers
  are configured on the GitHub `production` Environment**. Without that
  setting, it proceeds automatically after checks pass. Deployment also needs
  the Environment's Cloudflare secrets; see the
  [Worker setup and recovery runbook](../../workers/weather/README.md#automated-production-deployment).
- Manual Pages runs can deploy the selected ref. Manual Worker runs never
  deploy.

## Branch protection

`main` requires `lint`, `test`, `Static production build`, and `Validate Worker`
to pass, with branches up to date before merging. It does not require a PR,
reviewer approval, or resolved review conversations. Direct pushes are still
subject to the required checks for the pushed commit. These settings are
managed in GitHub, not by the workflow YAML.
