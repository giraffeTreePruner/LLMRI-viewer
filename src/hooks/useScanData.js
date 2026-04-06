import { useState, useCallback, useMemo } from 'react';
import { buildBalancedMatrix } from '../utils/heatmapMath';

/**
 * Parse and expose scan JSON data.
 *
 * Returns:
 *   scanData      — raw parsed JSON (or null)
 *   loading       — bool
 *   error         — string | null
 *   loadFromUrl   — async fn(url)
 *   loadFromFile  — async fn(file)
 *   getMatrix     — fn(metric) → 2D array | null
 *   numLayers     — int | null
 */
export function useScanData() {
  const [scanData, setScanData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function validate(data) {
    // Accept legacy brainscan_version key from pre-rename scans
    if (!('llmri_version' in data) && 'brainscan_version' in data) {
      data.llmri_version = data.brainscan_version;
    }
    const required = ['llmri_version', 'scan_metadata', 'results', 'heatmap_matrices'];
    for (const key of required) {
      if (!(key in data)) {
        throw new Error(`Missing required key: "${key}". Is this a valid LL-MRI JSON?`);
      }
    }
  }

  const loadFromUrl = useCallback(async (url) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      validate(data);
      setScanData(data);
    } catch (e) {
      setError(e.message);
      setScanData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFromFile = useCallback((file) => {
    setLoading(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        validate(data);
        setScanData(data);
      } catch (err) {
        setError(err.message);
        setScanData(null);
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => {
      setError('Failed to read file.');
      setLoading(false);
    };
    reader.readAsText(file);
  }, []);

  const numLayers = scanData?.scan_metadata?.num_layers ?? null;

  const getMatrix = useCallback(
    (metric) => {
      if (!scanData) return null;
      const hm = scanData.heatmap_matrices;
      if (metric === 'balanced') {
        const pmqa = hm?.pubmedqa_delta?.data;
        const eq = hm?.eq_delta?.data;
        if (!pmqa || !eq) return null;
        return buildBalancedMatrix(pmqa, eq);
      }
      return hm?.[metric]?.data ?? null;
    },
    [scanData]
  );

  // Build a lookup map from config key "[i,j]" → result entry
  const resultMap = useMemo(() => {
    if (!scanData) return {};
    const map = {};
    for (const r of scanData.results ?? []) {
      map[`${r.config[0]},${r.config[1]}`] = r;
    }
    // Also add baseline
    if (scanData.baseline) {
      const b = scanData.baseline;
      map[`${b.config[0]},${b.config[1]}`] = b;
    }
    return map;
  }, [scanData]);

  const getResult = useCallback(
    (i, j) => resultMap[`${i},${j}`] ?? null,
    [resultMap]
  );

  return { scanData, loading, error, loadFromUrl, loadFromFile, getMatrix, getResult, numLayers };
}
