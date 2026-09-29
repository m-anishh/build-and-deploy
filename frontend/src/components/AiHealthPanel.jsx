import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const COLOR = { normal: '#22C55E', warning: '#FF8A3D', critical: '#EC4899', unknown: '#5b6b8c' };

// Sends the current runtime sample to the ML service each time telemetry
// updates, and shows the anomaly verdict. "Train" fits the model on the recent
// live series so it learns THIS app's normal behaviour.
export default function AiHealthPanel({ totals, series }) {
  const [res, setRes] = useState(null);
  const [info, setInfo] = useState(null);
  const [down, setDown] = useState(false);
  const [training, setTraining] = useState(false);
  const busy = useRef(false);

  const sample = totals && {
    rps: totals.rps || 0,
    error_rate: (totals.errorPct || 0) / 100,
    latency_ms: totals.latency || 0,
    mem_mb: totals.memMB || 0,
    cpu: totals.cpu || 0,
  };

  useEffect(() => {
    if (!sample || busy.current) return;
    busy.current = true;
    api.mlPredict(sample)
      .then((r) => { setRes(r); setDown(false); })
      .catch(() => setDown(true))
      .finally(() => { busy.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals?.total]);

  useEffect(() => { api.mlInfo().then(setInfo).catch(() => {}); }, [training]);

  const train = async () => {
    if (!series?.length) return;
    setTraining(true);
    const samples = series.map((p) => ({
      rps: p.rps, error_rate: p.rps ? Math.min(1, p.eps / p.rps) : 0,
      latency_ms: p.latency, mem_mb: p.mem, cpu: totals.cpu || 0,
    }));
    try { await api.mlTrain(samples); } catch { /* ignore */ }
    setTraining(false);
  };

  const sev = res?.severity || 'unknown';
  const color = COLOR[sev];

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>AI health · anomaly detection</h3>
        <span className="panel-sub">{info ? `model: ${info.source}` : 'ml'}</span>
      </div>
      <div className="panel-body ai-body">
        {down ? (
          <p className="muted center">ML service offline<br /><small>start services/ml on :8000</small></p>
        ) : (
          <>
            <div className="ai-verdict" style={{ color }}>
              <div className="ai-dot" style={{ background: color, boxShadow: `0 0 18px ${color}` }} />
              <div>
                <div className="ai-status">{sev === 'normal' ? 'HEALTHY' : sev.toUpperCase()}</div>
                <div className="ai-score">score {res ? res.score : '…'} / thr {res ? res.threshold : '…'}</div>
              </div>
            </div>
            <div className="ai-feats">
              <Feat k="rps" v={sample?.rps?.toFixed(2)} />
              <Feat k="err" v={((sample?.error_rate || 0) * 100).toFixed(1) + '%'} />
              <Feat k="lat" v={(sample?.latency_ms || 0).toFixed(0) + 'ms'} />
              <Feat k="mem" v={(sample?.mem_mb || 0).toFixed(0) + 'MB'} />
            </div>
            <button className="btn primary ai-train" onClick={train} disabled={training}>
              {training ? 'Training…' : 'Train on live data'}
            </button>
            {info && <div className="ai-meta">trained on {info.n_samples} samples</div>}
          </>
        )}
      </div>
    </div>
  );
}

function Feat({ k, v }) {
  return <div className="feat"><span>{k}</span><b>{v ?? '—'}</b></div>;
}
