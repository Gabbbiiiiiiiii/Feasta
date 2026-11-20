This directory is part of Firebase's `functions` upload source.

`feasta-shared-types-0.1.0.tgz` is generated from the canonical
`packages/shared-types` source by `pnpm --dir functions build`. Do not edit its
contents. `shared-types-manifest.json` records its SHA-256 and exact file list.
The archive contains only package metadata, compiled runtime code and types;
it has no runtime dependencies or install scripts.

The build recompiles the canonical source, creates the archive and refreshes
the deployment-local file dependency before compiling Functions. After a shared
source change, run the Functions build and the root `pnpm install --offline
--ignore-scripts` to refresh both lockfiles; include the generated archive and
manifest with the source change.

Run `pnpm --dir functions test:deployment-runtime` after building. This uses
Firebase's upload packager, extracts its actual archive outside the repository,
installs production dependencies with the uploaded frozen lockfile and loads
the shared policy, compiled constants and full Functions entry. It never deploys
or invokes a handler. The dependency install may access the package registry.
