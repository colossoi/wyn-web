# Wyn Playground

Browser-based playground for the Wyn shader language: write Wyn, compile
to **WGSL** in-browser via WASM, see the shader run on a **WebGPU**
canvas in real time. A *Pipeline* panel visualizes every entry point in
the compiled program (vertex / fragment / compute) along with its
uniform/storage bindings. Built on React Router v7 (SSR) deployed to
Cloudflare Pages via a Worker.

Requires a browser with WebGPU (Chrome 113+, Edge, Safari TP). WebGL
fallback can be re-introduced if needed — the WGSL backend is the
primary path.

## Prerequisites

- Node.js 20+
- [wasm-pack](https://rustwasm.github.io/wasm-pack/) and a Rust toolchain with `wasm32-unknown-unknown`
- Optional, for deploys: a Cloudflare account + `wrangler` (installed as a devDep)

## Setup

```bash
cd playground
npm install
npm run build:wasm        # produces public/pkg/* via wasm-pack
```

## Development

```bash
npm run dev               # Vite dev server with HMR — http://localhost:5173
```

## Production build + local preview

```bash
npm run build             # rebuilds wasm + react-router build → build/{client,server}/
npm run preview           # wrangler dev — serves the Worker against the built bundle
```

## Deploy to Cloudflare Pages

**CLI**:
```bash
npm run deploy            # npm run build && wrangler deploy
```
First run prompts for Cloudflare auth.

**Git integration**: point the Pages project at this repo with build command `cd playground && npm install && npm run build` and output directory `playground/dist/client`. The Worker entry is picked up from `wrangler.jsonc` automatically.

## Project structure

```
playground/
├── app/                  # React Router app
│   ├── root.tsx          # html shell + CodeMirror CDN script
│   ├── routes/home.tsx   # playground orchestrator (state + flow)
│   ├── components/       # Editor, Preview, IRTree, StatusBar
│   ├── lib/wasm.ts       # WASM init + typed bindings (incl. ProgramInterface)
│   ├── lib/webgpu.ts     # WebGPU context + pipeline + RAF loop
│   ├── lib/webgl.ts      # (legacy — retained for reference)
│   └── app.css           # global stylesheet
├── workers/app.ts        # Cloudflare Worker entry — runs the SSR handler
├── public/
│   ├── pkg/              # wasm-pack output (gitignored, rebuilt by build:wasm)
│   └── _headers          # Cloudflare COOP/COEP headers
├── wyn-wasm/             # Rust crate compiled to WASM
├── react-router.config.ts
├── vite.config.ts
├── wrangler.jsonc
└── package.json
```

## Rebuilding after changes to `wyn-core`

```bash
npm run build:wasm        # picks up the latest wyn-core via the cargo workspace
```

The dev server hot-reloads the JS/TSX side automatically; only the WASM rebuild needs an explicit step.

## Example shader

```wyn
def main_image(resolution: vec3f32,
               time: f32,
               frag_coord: vec2f32) vec4f32 =
  let uv = frag_coord / resolution.xy in
  let r = 0.5 + 0.5 * f32.cos(time + uv.x * 3.0) in
  let g = 0.5 + 0.5 * f32.cos(time + uv.y * 3.0 + 2.0) in
  let b = 0.5 + 0.5 * f32.cos(time + (uv.x + uv.y) * 1.5 + 4.0) in
  @[r, g, b, 1.0]
```

The playground accepts any supported input subset by name and generates the
fullscreen graphics pipeline around `main_image`. See `/develop` in the running
site for the complete input list and development guide.
