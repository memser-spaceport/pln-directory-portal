# AI Apps starter-kit assets

## `pl-design-system.zip`

A curated, prebuilt copy of the **PL Design System**, shipped verbatim inside the
AI Apps starter kit (`AiAppsStarterKitService` embeds this file as-is — it is not
unpacked or recompressed server-side). It contains a single top-level
`pl-design-system/` folder with:

- `components/` — React components (`.tsx` + SCSS modules + types) and the
  per-component specs in `components/primitives/` and `components/product/`
- `tokens/`, `styles/` — SCSS design tokens, global styles, mixins
- `public/fonts/` — self-hosted Inter variable font
- `patterns/`, `examples/` — layout patterns and page-level reference compositions
- `guidelines.md` — design rules for agents
- `USAGE.md` — how to consume the system in a Next.js 14 app (PLN-specific)

It is stored as one binary instead of hundreds of loose files to keep Git clean,
and it is registered as a build asset in `apps/web-api/project.json` so it is
copied to `dist/apps/web-api/ai-apps/assets/pl-design-system.zip` on build.

### Regenerating

From a checkout of the PL Design System repo (`$DS`), stage the curated subset
under a `pl-design-system/` folder, add the kit's `USAGE.md`, then zip:

```bash
STAGE=$(mktemp -d)/pl-design-system
mkdir -p "$STAGE"
cp -R "$DS"/{components,tokens,styles,assets,patterns,examples} "$STAGE"/
cp -R "$DS"/public/fonts "$STAGE"/public/fonts
cp "$DS"/guidelines.md "$STAGE"/guidelines.md
cp USAGE.md "$STAGE"/USAGE.md        # keep the kit-specific consumption guide
find "$STAGE" -name '.DS_Store' -delete
( cd "$(dirname "$STAGE")" && zip -r -X -q pl-design-system.zip pl-design-system )
mv "$(dirname "$STAGE")"/pl-design-system.zip ./pl-design-system.zip
```

Excluded from the bundle: the showcase Next.js app (`src/`), `node_modules`,
`.next`, `_dist`, and `mockups/`.
