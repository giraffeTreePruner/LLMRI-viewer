# LL-MRI Viewer

An interactive web app for exploring [LL-MRI](https://github.com/giraffeTreePruner/LL-MRI-scanner) scan results. Visualizes the performance impact of RYS (Repeat Yourself Smarter) layer duplication configurations across transformer models.

![Tech Stack](https://img.shields.io/badge/React-18-blue) ![D3](https://img.shields.io/badge/D3-7-orange) ![Vite](https://img.shields.io/badge/Vite-5-purple)

---

## What is RYS?

RYS (Repeat Yourself Smarter), discovered by [dnhkng](https://dnhkng.github.io/posts/rys/), improves a transformer's performance by duplicating a contiguous block of its middle layers and running inference through that block twice — no retraining, no new weights.

A configuration `(i, j)` causes the layer execution path `[0..j-1] + [i..N-1]`, meaning layers `i` through `j-1` run twice. Applied to Qwen2-72B at `(45, 52)`, this reached #1 on the HuggingFace Open LLM Leaderboard with a +2.61% average gain and zero additional parameters.

The technique reveals a three-phase transformer anatomy — **encoding**, **reasoning**, and **decoding** — that is consistent across model families. Middle layers function as complete reasoning *circuits*; duplicating them gives the model a second pass with its existing circuitry, essentially letting it think longer for free. A [follow-up sweep across 2 million candidates](https://dnhkng.github.io/posts/rys-ii/) confirmed that simple contiguous mid-stack blocks dominate the efficiency frontier: duplicating a single layer pair can capture most of the gain at under 2% compute overhead.

LL-MRI exhaustively evaluates all valid `(i, j)` configurations for a given model and measures the effect on benchmark performance. The heatmap it renders is the same structural "brain scan" the original articles used to map transformer anatomy — LL-MRI Viewer makes those results interactive and explorable.

---

## Features

- **2D Heatmap** — Interactive matrix of all `(i, j)` configs, colored by performance delta vs. baseline
- **Four Metrics** — Switch between PubMedQA delta, EQ-Bench delta, Combined average, or Balanced (min of both — requires improvement on both probes)
- **Skyline Plots** — Marginal sparklines docked to the heatmap axes showing average delta per start-layer `S(i)` and end-layer `E(j)` with ±1σ bands
- **Config Inspector** — Click any cell to see exact scores, deltas, parameter increase %, and a visual layer path strip showing which layers are duplicated
- **Multi-select Comparison** — Shift-click multiple configs to compare them side by side
- **Region Selection** — Click and drag to select a rectangular region and view aggregate stats
- **Export Commands** — One-click copy of `hf_export` bash commands for any selected config
- **File Upload** — Drag and drop your own LL-MRI JSON to visualize custom scan results
- **Demo Models** — Ships with a pre-computed scan for `Qwen2.5-3B-Instruct`

---

## Getting Started

```bash
npm install
npm run dev        # Dev server at localhost:5173
npm run build      # Production build → dist/
npm run preview    # Preview the built dist locally
```

---

## Project Structure

```
LL-MRI-viewer/
├── public/
│   └── data/                        # Pre-computed scan JSONs for demo
│       └── qwen25-3b-instruct.json
├── src/
│   ├── main.jsx                     # App entry point
│   ├── App.jsx                      # Root layout and state orchestration
│   ├── components/
│   │   ├── Heatmap.jsx              # D3 heatmap — hover, click, drag interactions
│   │   ├── SkylinePlots.jsx         # S(i) and E(j) marginal sparklines
│   │   ├── ConfigPanel.jsx          # Config details, scores, layer path strip
│   │   ├── ExportCommands.jsx       # Copy-able bash command blocks
│   │   ├── ModelSelector.jsx        # Demo model switcher
│   │   ├── FileUpload.jsx           # Drag-and-drop JSON upload
│   │   ├── MetricToggle.jsx         # PubMedQA / EQ / Combined / Balanced toggle
│   │   ├── ComparisonTable.jsx      # Multi-select comparison table
│   │   └── HowItWorks.jsx           # Collapsible RYS explainer
│   ├── hooks/
│   │   ├── useScanData.js           # JSON parsing, validation, matrix access
│   │   └── useSelection.js          # Hover, click, and drag selection state
│   └── utils/
│       ├── colorScale.js            # D3 diverging red-blue color scale
│       ├── heatmapMath.js           # S(i), E(j) marginals and balanced delta
│       └── exportCommands.js        # hf_export command template generation
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

---

## Scan JSON Format

LL-MRI Viewer accepts JSON files produced by [LL-MRI](https://github.com/giraffeTreePruner/LL-MRI-scanner). Required top-level keys:

```json
{
  "llmri_version": "1.0.0",
  "scan_metadata": {
    "model_name": "Qwen/Qwen2.5-3B-Instruct",
    "num_layers": 28,
    "total_configs": 406,
    "completed_configs": 406
  },
  "baseline": { "..." },
  "results": [ "..." ],
  "heatmap_matrices": {
    "pubmedqa_delta": { "data": [["..."]] },
    "eq_delta":       { "data": [["..."]] },
    "combined_delta": { "data": [["..."]] }
  }
}
```

Each entry in `results` includes `config`, scores, deltas, `param_increase_pct`, `layer_path`, and `duplicated_layers`.

---

## Tech Stack

| Layer | Library |
|---|---|
| UI framework | React 18 |
| Visualization | D3 7 |
| Styling | Tailwind CSS 3 |
| Build tool | Vite 5 |
| Deploy target | Any static host (Vercel, GitHub Pages, etc.) |

No backend — all JSON parsing and computation runs client-side.

---

## Color Conventions

- **Red** — improvement over baseline (positive delta)
- **Blue** — degradation vs. baseline (negative delta)
- **Star marker** — baseline config `(0, 0)`
- **Green circle** — best combined-metric config
