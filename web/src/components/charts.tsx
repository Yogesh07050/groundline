// Hand-built charts over the real analytics responses. Three forms cover what the
// overview needs, so a charting library would add more weight than it saves.
import { useId, useRef, useState } from 'react';
import { number, shortDay } from '../lib/format';

// --- Columns: one series over time -------------------------------------------

interface Point {
  date: string;
  value: number;
}

const niceMax = (max: number) => {
  if (max <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * magnitude).find((s) => s * 4 >= max) ?? magnitude * 10;
  return step * 4;
};

export function ColumnChart({ points, unit }: { points: Point[]; unit: string }) {
  const [active, setActive] = useState<number | null>(null);
  const [width, setWidth] = useState(640);
  const observer = useRef<ResizeObserver | null>(null);
  const titleId = useId();

  const measure = (el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!el) return;
    setWidth(el.clientWidth);
    observer.current = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.current.observe(el);
  };

  const height = 200;
  const margin = { top: 8, right: 0, bottom: 22, left: 32 };
  const plotW = Math.max(0, width - margin.left - margin.right);
  const plotH = height - margin.top - margin.bottom;
  const max = niceMax(Math.max(...points.map((p) => p.value), 0));
  const slot = plotW / Math.max(points.length, 1);
  const barW = Math.min(24, Math.max(2, slot - 2));
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(plotW / 72))));
  const hovered = active !== null ? points[active] : null;

  return (
    <div className="chart" ref={measure}>
      <svg width={width} height={height} role="img" aria-labelledby={titleId} onMouseLeave={() => setActive(null)}>
        <title id={titleId}>
          {`${unit} per day, ${points.length} days. Total ${number(points.reduce((sum, p) => sum + p.value, 0))}.`}
        </title>
        {ticks.map((tick) => {
          const y = margin.top + plotH - (tick / max) * plotH;
          return (
            <g key={tick}>
              <line x1={margin.left} x2={width} y1={y} y2={y} className="chart-grid" />
              <text x={margin.left - 8} y={y + 4} textAnchor="end" className="chart-tick">
                {number(tick)}
              </text>
            </g>
          );
        })}
        {points.map((point, i) => {
          const x = margin.left + i * slot + (slot - barW) / 2;
          const h = (point.value / max) * plotH;
          const y = margin.top + plotH - h;
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={point.date}>
              {h > 0 ? (
                <path
                  d={`M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + barW - r}Q${x + barW},${y} ${x + barW},${y + r}V${y + h}Z`}
                  className={active === i ? 'chart-bar active' : 'chart-bar'}
                />
              ) : null}
              {i % labelEvery === 0 ? (
                <text x={x + barW / 2} y={height - 6} textAnchor="middle" className="chart-tick">
                  {shortDay(point.date)}
                </text>
              ) : null}
              <rect
                x={margin.left + i * slot}
                y={margin.top}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setActive(i)}
              />
            </g>
          );
        })}
      </svg>
      {hovered && active !== null ? (
        <div
          className="chart-tooltip"
          style={{ left: Math.min(Math.max(margin.left + active * slot + slot / 2, 60), width - 60) }}
          role="status"
        >
          <span className="muted">{shortDay(hovered.date)}</span>
          <strong className="tnum">
            {number(hovered.value)} {unit.toLowerCase()}
          </strong>
        </div>
      ) : null}
      <details className="chart-table">
        <summary>View as table</summary>
        <div className="chart-table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Day</th>
                <th className="num">{unit}</th>
              </tr>
            </thead>
            <tbody>
              {points.filter((p) => p.value > 0).map((p) => (
                <tr key={p.date}>
                  <td>{shortDay(p.date)}</td>
                  <td className="num">{number(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// --- Segmented bar: parts of a whole -----------------------------------------

export function SegmentedBar({ segments }: { segments: Array<{ label: string; value: number; color: string; hint: string }> }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  return (
    <div>
      <div className="segbar" role="img" aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(', ')}>
        {visible.map((s) => (
          <div key={s.label} title={`${s.label}: ${number(s.value)}`} style={{ flexGrow: s.value, background: s.color }} />
        ))}
      </div>
      <ul className="legend">
        {segments.map((s) => (
          <li key={s.label}>
            <span className="legend-swatch" style={{ background: s.color }} aria-hidden />
            <span className="legend-label">
              {s.label}
              <span className="muted">{s.hint}</span>
            </span>
            <span className="legend-value tnum">
              {number(s.value)}
              <span className="muted"> · {total ? Math.round((s.value / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Horizontal bars: ranked magnitudes --------------------------------------

export function RankedBars({ rows }: { rows: Array<{ id: string; label: string; sublabel?: string; value: number; href?: string }> }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="ranked">
      {rows.map((row) => (
        <li key={row.id}>
          <div className="ranked-text">
            <span className="truncate">{row.label}</span>
            {row.sublabel ? <span className="muted ranked-sub">{row.sublabel}</span> : null}
            <span className="tnum ranked-value">{number(row.value)}</span>
          </div>
          <div className="ranked-track">
            <div style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
