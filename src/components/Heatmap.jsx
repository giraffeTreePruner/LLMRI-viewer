import { useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import { makeColorScale, nullColor } from '../utils/colorScale';

const MARGIN = { top: 24, right: 16, bottom: 48, left: 48 };
const CELL_MAX = 18; // max px per cell
const CELL_MIN = 4;

/**
 * D3 heatmap for the RYS (i,j) sweep results.
 *
 * matrix[i][j] = delta value or null (unmeasured).
 * Valid cells: j > i (upper-triangular). (0,0) = baseline.
 *
 * Interaction:
 *   hover   → tooltip + onHover callback
 *   click   → onSelect callback (shiftKey for multi-select)
 *   drag    → rectangular region selection via onDragSelect
 */
export function Heatmap({
  matrix,
  numLayers,
  metric,
  hovered,
  selected,
  dragRegion,
  bestConfig,
  onHover,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  width,
}) {
  const svgRef = useRef(null);
  const tooltipRef = useRef(null);
  const isDragging = useRef(false);
  const pendingClick = useRef(null);

  // Dimensions
  const N = numLayers ?? (matrix?.length ? matrix.length - 1 : 0);
  const innerW = width - MARGIN.left - MARGIN.right;
  const cellSize = Math.max(CELL_MIN, Math.min(CELL_MAX, Math.floor(innerW / (N + 1))));
  const gridW = cellSize * (N + 1);
  const gridH = cellSize * (N + 1);
  const svgW = gridW + MARGIN.left + MARGIN.right;
  const svgH = gridH + MARGIN.top + MARGIN.bottom;

  const colorScale = matrix ? makeColorScale(matrix, metric) : () => nullColor();

  // Cell coordinate helpers
  function cellFromEvent(e, g) {
    const [mx, my] = d3.pointer(e, g);
    const ci = Math.floor(my / cellSize);
    const cj = Math.floor(mx / cellSize);
    if (ci < 0 || ci > N || cj < 0 || cj > N) return null;
    return { i: ci, j: cj };
  }

  useEffect(() => {
    if (!svgRef.current || !matrix || N === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', svgW).attr('height', svgH);

    const g = svg
      .append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // --- Draw cells ---
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const val = matrix[i]?.[j];
        const isBaseline = i === 0 && j === 0;
        const isValid = isBaseline || (j > i);
        const isNull = val === null || val === undefined || !isFinite(val);
        const isBest = bestConfig && bestConfig[0] === i && bestConfig[1] === j;
        const isHovered = hovered && hovered.i === i && hovered.j === j;
        const isSel = selected?.some((c) => c.i === i && c.j === j);
        const inDrag =
          dragRegion &&
          i >= Math.min(dragRegion.i0, dragRegion.i1) &&
          i <= Math.max(dragRegion.i0, dragRegion.i1) &&
          j >= Math.min(dragRegion.j0, dragRegion.j1) &&
          j <= Math.max(dragRegion.j0, dragRegion.j1);

        const x = j * cellSize;
        const y = i * cellSize;
        const fill = !isValid || isNull ? nullColor() : colorScale(val);

        // Cell rect
        g.append('rect')
          .attr('x', x + 0.5)
          .attr('y', y + 0.5)
          .attr('width', cellSize - 1)
          .attr('height', cellSize - 1)
          .attr('fill', fill)
          .attr('rx', 1)
          .attr('opacity', !isValid ? 0.15 : 1);

        // Selection ring
        if ((isSel || inDrag) && isValid && !isNull) {
          g.append('rect')
            .attr('x', x + 1)
            .attr('y', y + 1)
            .attr('width', cellSize - 2)
            .attr('height', cellSize - 2)
            .attr('fill', 'none')
            .attr('stroke', inDrag && !isSel ? '#a78bfa' : '#f9fafb')
            .attr('stroke-width', inDrag && !isSel ? 1 : 1.5)
            .attr('rx', 1)
            .attr('pointer-events', 'none');
        }

        // Hover highlight
        if (isHovered && isValid) {
          g.append('rect')
            .attr('x', x + 0.5)
            .attr('y', y + 0.5)
            .attr('width', cellSize - 1)
            .attr('height', cellSize - 1)
            .attr('fill', 'none')
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5)
            .attr('rx', 1)
            .attr('pointer-events', 'none');
        }

        // Baseline star
        if (isBaseline && cellSize >= 8) {
          g.append('text')
            .attr('x', x + cellSize / 2)
            .attr('y', y + cellSize / 2 + 4)
            .attr('text-anchor', 'middle')
            .attr('font-size', Math.min(cellSize - 2, 12))
            .attr('fill', '#fbbf24')
            .attr('pointer-events', 'none')
            .text('★');
        }

        // Best config marker
        if (isBest && !isBaseline && cellSize >= 8) {
          g.append('circle')
            .attr('cx', x + cellSize / 2)
            .attr('cy', y + cellSize / 2)
            .attr('r', Math.min(cellSize / 2 - 1, 5))
            .attr('fill', 'none')
            .attr('stroke', '#22c55e')
            .attr('stroke-width', 1.5)
            .attr('pointer-events', 'none');
        }
      }
    }

    // --- Axes ---
    const xScale = d3.scaleLinear().domain([0, N]).range([cellSize / 2, gridW - cellSize / 2]);
    const yScale = d3.scaleLinear().domain([0, N]).range([cellSize / 2, gridH - cellSize / 2]);

    const tickStep = N <= 20 ? 2 : N <= 40 ? 5 : 10;
    const ticks = d3.range(0, N + 1, tickStep);

    g.append('g')
      .attr('transform', `translate(0,${gridH})`)
      .call(d3.axisBottom(xScale).tickValues(ticks).tickSize(3))
      .call((a) => a.select('.domain').attr('stroke', '#374151'))
      .call((a) => a.selectAll('text').attr('fill', '#9ca3af').attr('font-size', 9))
      .call((a) => a.selectAll('line').attr('stroke', '#374151'));

    g.append('g')
      .call(d3.axisLeft(yScale).tickValues(ticks).tickSize(3))
      .call((a) => a.select('.domain').attr('stroke', '#374151'))
      .call((a) => a.selectAll('text').attr('fill', '#9ca3af').attr('font-size', 9))
      .call((a) => a.selectAll('line').attr('stroke', '#374151'));

    // Axis labels
    svg.append('text')
      .attr('x', MARGIN.left + gridW / 2)
      .attr('y', svgH - 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#6b7280')
      .attr('font-size', 10)
      .text('j (end layer)');

    svg.append('text')
      .attr('transform', `translate(12,${MARGIN.top + gridH / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .attr('fill', '#6b7280')
      .attr('font-size', 10)
      .text('i (start layer)');

    // --- Interaction overlay ---
    const overlay = g.append('rect')
      .attr('width', gridW)
      .attr('height', gridH)
      .attr('fill', 'transparent')
      .attr('cursor', 'crosshair');

    overlay.on('mousemove', (e) => {
      const cell = cellFromEvent(e, g.node());
      if (cell) {
        const val = matrix[cell.i]?.[cell.j];
        const isValid = (cell.i === 0 && cell.j === 0) || cell.j > cell.i;
        onHover(isValid ? cell : null);

        if (isDragging.current) {
          onDragMove(cell);
        }

        // Tooltip
        if (tooltipRef.current && isValid) {
          const [px, py] = d3.pointer(e, svgRef.current);
          const tt = tooltipRef.current;
          tt.style.display = 'block';
          tt.style.left = `${px + 10}px`;
          tt.style.top = `${py - 10}px`;

          const isBaseline = cell.i === 0 && cell.j === 0;
          tt.innerHTML = isBaseline
            ? `<div class="font-semibold">Baseline (0,0)</div>`
            : [
                `<div class="font-semibold">(${cell.i}, ${cell.j})</div>`,
                val != null ? `<div>Δ = <span class="${val >= 0 ? 'text-red-400' : 'text-blue-400'}">${(val >= 0 ? '+' : '') + val.toFixed(4)}</span></div>` : '<div class="text-gray-500">no data</div>',
              ].join('');
        }
      } else {
        onHover(null);
        if (tooltipRef.current) tooltipRef.current.style.display = 'none';
      }
    });

    overlay.on('mouseleave', () => {
      onHover(null);
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
      if (isDragging.current) {
        isDragging.current = false;
        onDragEnd();
      }
    });

    overlay.on('mousedown', (e) => {
      const cell = cellFromEvent(e, g.node());
      if (!cell) return;
      isDragging.current = false;
      // Store in a ref so it survives effect re-runs triggered by state changes
      pendingClick.current = { cell, shiftKey: e.shiftKey, startPos: d3.pointer(e) };
    });

    overlay.on('mousemove.drag', (e) => {
      if (!pendingClick.current) return;
      const [cx, cy] = d3.pointer(e);
      const [sx, sy] = pendingClick.current.startPos;
      if (!isDragging.current && (Math.abs(cx - sx) > 4 || Math.abs(cy - sy) > 4)) {
        isDragging.current = true;
        // Only trigger drag state update once movement is confirmed
        onDragStart(pendingClick.current.cell);
      }
    });

    overlay.on('mouseup', (e) => {
      const pending = pendingClick.current;
      pendingClick.current = null;
      if (!pending) return;

      if (isDragging.current) {
        isDragging.current = false;
        onDragEnd();
      } else {
        const cell = pending.cell;
        const val = matrix[cell.i]?.[cell.j];
        const isValid = (cell.i === 0 && cell.j === 0) || cell.j > cell.i;
        if (isValid && (val !== null && val !== undefined)) {
          onSelect(cell, pending.shiftKey);
        }
      }
    });
  }, [matrix, N, cellSize, colorScale, hovered, selected, dragRegion, bestConfig]);

  if (!matrix || N === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-600 text-sm">
        No scan data loaded.
      </div>
    );
  }

  return (
    <div className="relative inline-block">
      <svg ref={svgRef} />
      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={{ display: 'none', position: 'absolute', pointerEvents: 'none', zIndex: 10 }}
        className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-200 shadow-lg"
      />
    </div>
  );
}
