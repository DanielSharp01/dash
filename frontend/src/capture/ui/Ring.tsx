import type { ReactNode } from "react";

interface Props {
  value: number;
  target: number;
  /** Some entries have no value, so the real total is higher than shown. */
  uncertain: boolean;
  size: number;
  stroke: number;
  color: string;
  label: string;
  unit: string;
  children?: ReactNode;
}

/**
 * A progress ring. When something eaten has no value, the unfilled part turns into a
 * fuzzy stripe in the series color: the ring can't claim what's left is really left.
 */
export function Ring({ value, target, uncertain, size, stroke, color, label, unit, children }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const scale = Math.max(target, value);
  const filled = scale ? (value / scale) * c : 0;
  const patternId = `fuzz-${label.replace(/\W/g, "")}`;
  const description = `${label}: ${uncertain ? "at least " : ""}${Math.round(value)} of ${target} ${unit}`;

  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={description}>
        <title>{uncertain ? `${description}; some entries are unknown` : description}</title>
        <defs>
          <pattern id={patternId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="5" height="5" style={{ fill: color }} opacity="0.12" />
            <rect width="2" height="5" style={{ fill: color }} opacity="0.45" />
          </pattern>
        </defs>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`} fill="none" strokeWidth={stroke}>
          <circle
            className={uncertain ? undefined : "ring-track"}
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={uncertain ? `url(#${patternId})` : undefined}
          />
          {filled > 0 && <circle cx={size / 2} cy={size / 2} r={r} style={{ stroke: color }} strokeDasharray={`${filled} ${c}`} />}
        </g>
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
