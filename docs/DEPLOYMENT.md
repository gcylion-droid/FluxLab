# GitHub Pages deployment

The public application is served at https://wieslawsoltes.github.io/FluxLab/.
All scripts, shaders, workers, styles, and example cases use relative URLs, so the
application works under the repository path without a domain-root rewrite.

The verify-and-deploy workflow runs the numerical/worker tests, builds the
standalone HTML and static directory, uploads the Pages artifact, and deploys
`main` to the `github-pages` environment. Pull requests build and test only.
The workflow can also be run manually from the Actions tab. Deployment uses the
repository-scoped GITHUB_TOKEN and GitHub OIDC; no personal token is required.

## Local build

```sh
npm test
npm run build
```

The result is `dist/`. There are no runtime npm dependencies. The included
server runs with `npm start`. WebGPU requires a supported browser and GPU, and
a secure context (HTTPS or localhost). The application reports its actual
backend and falls back to the real CPU solver when GPU initialization fails.

## Browser verification

```sh
python3 -m pip install playwright
python3 -m playwright install chromium
npm run test:browser
```

Browser verification writes JSON diagnostics and desktop, dark-theme, and mobile
screenshots to `test-results/`. Hardware WebGPU validation is distinct from
headless software-adapter validation; consult docs/VALIDATION.md for the scope
of the original numerical and browser checks.

## Repository administration

GitHub Pages must be enabled in Settings > Pages. For the custom workflow, set
Build and deployment > Source to GitHub Actions. The public repository already
reported Pages enabled when this deployment was prepared.
