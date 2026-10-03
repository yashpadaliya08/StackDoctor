import React from 'react';

interface ScoreGaugeProps {
  score: number;
  size?: number;
}

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({ score, size = 160 }) => {
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  let strokeColor = '#10b981'; // green
  let statusLabel = 'PRODUCTION READY';
  let labelColor = '#34d399';

  if (score < 50) {
    strokeColor = '#dc2626'; // solid red
    statusLabel = 'CRITICAL BLOCKERS';
    labelColor = '#f87171';
  } else if (score < 70) {
    strokeColor = '#d97706'; // solid amber
    statusLabel = 'NEEDS ATTENTION';
    labelColor = '#fbbf24';
  } else if (score < 90) {
    strokeColor = '#0284c7'; // solid blue
    statusLabel = 'MOSTLY READY';
    labelColor = '#38bdf8';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#1e293b"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Animated Value Arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            style={{
              transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.5s ease',
            }}
          />
        </svg>

        {/* Center Text */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: '2.4rem', fontWeight: 800, fontFamily: 'var(--font-heading)', lineHeight: 1 }}>
            {score}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2px' }}>
            / 100
          </span>
        </div>
      </div>

      <div
        style={{
          marginTop: '12px',
          fontSize: '0.8rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          color: labelColor,
          textTransform: 'uppercase',
        }}
      >
        {statusLabel}
      </div>
    </div>
  );
};
