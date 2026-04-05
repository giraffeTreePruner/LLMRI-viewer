import { useState, useEffect, useRef } from 'react';
import { useScanData } from './hooks/useScanData';
import { useSelection } from './hooks/useSelection';
import { Heatmap } from './components/Heatmap';
import { SkylinePlots } from './components/SkylinePlots';
import { ConfigPanel } from './components/ConfigPanel';
import { ExportCommands } from './components/ExportCommands';
import { ComparisonTable } from './components/ComparisonTable';
import { MetricToggle } from './components/MetricToggle';
import { ModelSelector } from './components/ModelSelector';
import { FileUpload } from './components/FileUpload';
import { HowItWorks } from './components/HowItWorks';

const DEMO_URLS = {
  'qwen25-3b': '/data/qwen25-3b-instruct.json',
  'llama32-3b': '/data/llama32-3b-instruct.json',
};

export default function App() {
  const { scanData, loading, error, loadFromUrl, loadFromFile, getMatrix, getResult, numLayers } =
    useScanData();

  const sel = useSelection();
  const [metric, setMetric] = useState('combined_delta');
  const [activeDemo, setActiveDemo] = useState(null);
  const [availableDemos, setAvailableDemos] = useState([]);
  const heatmapContainerRef = useRef(null);
  const [heatmapWidth, setHeatmapWidth] = useState(600);

  // Probe which demo JSONs are actually present (check content-type to
  // avoid treating Vite's HTML 404 fallback as a valid JSON file).
  useEffect(() => {
    Promise.all(
      Object.entries(DEMO_URLS).map(async ([key, url]) => {
        try {
          const r = await fetch(url);
          if (!r.ok) return null;
          const ct = r.headers.get('content-type') ?? '';
          if (!ct.includes('json')) return null;
          return key;
        } catch {
          return null;
        }
      })
    ).then((results) => setAvailableDemos(results.filter(Boolean)));
  }, []);

  // Load first available demo on mount
  useEffect(() => {
    if (availableDemos.length > 0 && !scanData && !loading) {
      const key = availableDemos[0];
      setActiveDemo(key);
      loadFromUrl(DEMO_URLS[key]);
    }
  }, [availableDemos]);

  // Track heatmap container width for responsive sizing
  useEffect(() => {
    if (!heatmapContainerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setHeatmapWidth(entries[0].contentRect.width);
    });
    ro.observe(heatmapContainerRef.current);
    return () => ro.disconnect();
  }, []);

  function handleDemoSelect(key, url) {
    setActiveDemo(key);
    sel.clearSelection();
    loadFromUrl(url);
  }

  function handleFile(file) {
    setActiveDemo(null);
    sel.clearSelection();
    loadFromFile(file);
  }

  const matrix = getMatrix(metric);
  const primarySelected = sel.selected[0] ?? null;
  const selectedResult = primarySelected ? getResult(primarySelected.i, primarySelected.j) : null;

  // Best combined_delta config (excluding baseline)
  const bestConfig = (() => {
    if (!scanData) return null;
    let best = null;
    let bestVal = -Infinity;
    for (const r of scanData.results ?? []) {
      if (r.config[0] === 0 && r.config[1] === 0) continue;
      if ((r.combined_delta ?? -Infinity) > bestVal) {
        bestVal = r.combined_delta;
        best = r.config;
      }
    }
    return best;
  })();

  const modelName = scanData?.scan_metadata?.model_name ?? null;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full lg:w-64 xl:w-72 bg-gray-900 border-r border-gray-800 flex flex-col gap-5 p-4 shrink-0">
        {/* Logo */}
        <div>
          <h1 className="text-lg font-bold text-gray-100 tracking-tight">
            🧠 LL-MRI <span className="text-indigo-400">Viewer</span>
          </h1>
          {modelName && (
            <div className="text-xs text-gray-500 mt-0.5 truncate" title={modelName}>
              {modelName}
            </div>
          )}
          {scanData && (
            <div className="text-xs text-gray-600 mt-0.5">
              {numLayers} layers · {scanData.scan_metadata?.total_configs ?? '?'} configs
            </div>
          )}
        </div>

        <ModelSelector
          activeKey={activeDemo}
          onSelect={handleDemoSelect}
          availableKeys={availableDemos}
        />

        <FileUpload onFile={handleFile} error={error} />

        <MetricToggle metric={metric} onChange={setMetric} />

        <div className="mt-auto">
          <HowItWorks />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="border-b border-gray-800 px-4 py-2 flex items-center gap-3 text-xs text-gray-500">
          {loading && <span className="text-indigo-400 animate-pulse">Loading...</span>}
          {!loading && !scanData && !error && (
            <span>Load a demo scan or upload your own JSON to begin.</span>
          )}
          {bestConfig && (
            <span>
              Best config:{' '}
              <button
                className="text-green-400 font-mono hover:underline"
                onClick={() => sel.select({ i: bestConfig[0], j: bestConfig[1] })}
              >
                ({bestConfig[0]}, {bestConfig[1]})
              </button>
            </span>
          )}
          {sel.selected.length > 1 && (
            <span className="text-purple-400">{sel.selected.length} configs selected (shift-click to add)</span>
          )}
          {sel.selected.length > 0 && (
            <button
              className="ml-auto text-gray-600 hover:text-gray-400"
              onClick={sel.clearSelection}
            >
              clear selection ✕
            </button>
          )}
        </div>

        <div className="flex-1 flex flex-col xl:flex-row overflow-auto">
          {/* Heatmap area */}
          <div className="flex-1 p-4 min-w-0" ref={heatmapContainerRef}>
            <Heatmap
              matrix={matrix}
              numLayers={numLayers}
              metric={metric}
              hovered={sel.hovered}
              selected={sel.selected}
              dragRegion={sel.dragRegion}
              bestConfig={bestConfig}
              onHover={sel.hover}
              onSelect={sel.select}
              onDragStart={sel.startDrag}
              onDragMove={sel.updateDrag}
              onDragEnd={() => sel.endDrag(getResult, matrix)}
              width={Math.max(300, heatmapWidth)}
            />
            {matrix && (
              <SkylinePlots matrix={matrix} width={Math.max(300, heatmapWidth)} />
            )}
          </div>

          {/* Right panel */}
          <div className="w-full xl:w-80 2xl:w-96 border-t xl:border-t-0 xl:border-l border-gray-800 p-4 flex flex-col gap-5 overflow-y-auto shrink-0">
            <ConfigPanel
              result={selectedResult}
              numLayers={numLayers}
              isBaseline={
                selectedResult?.config?.[0] === 0 &&
                selectedResult?.config?.[1] === 0
              }
            />

            {selectedResult && primarySelected && !(primarySelected.i === 0 && primarySelected.j === 0) && (
              <ExportCommands
                modelName={modelName}
                i={primarySelected.i}
                j={primarySelected.j}
              />
            )}

            <ComparisonTable
              selected={sel.selected}
              getResult={getResult}
              baseline={scanData?.baseline}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
