// Minimal Prometheus text-exposition parser.
// Turns the /metrics body into { name, labels, value }[] samples.

export function parseProm(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line || line[0] === '#') continue;
    const sp = line.lastIndexOf(' ');
    if (sp === -1) continue;
    const left = line.slice(0, sp);
    const value = Number(line.slice(sp + 1));
    if (Number.isNaN(value)) continue;
    const brace = left.indexOf('{');
    let name, labels = {};
    if (brace === -1) {
      name = left;
    } else {
      name = left.slice(0, brace);
      const body = left.slice(brace + 1, left.lastIndexOf('}'));
      // split on commas not inside quotes
      body.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).forEach((kv) => {
        const eq = kv.indexOf('=');
        if (eq === -1) return;
        const k = kv.slice(0, eq).trim();
        const v = kv.slice(eq + 1).trim().replace(/^"|"$/g, '');
        if (k) labels[k] = v;
      });
    }
    out.push({ name, labels, value });
  }
  return out;
}

// Sum values of a metric, optionally grouped by a label.
export function sumBy(samples, name, label) {
  const acc = {};
  let total = 0;
  for (const s of samples) {
    if (s.name !== name) continue;
    total += s.value;
    if (label) {
      const key = s.labels[label] ?? 'unknown';
      acc[key] = (acc[key] || 0) + s.value;
    }
  }
  return label ? acc : total;
}

// Filter samples by name + label predicate.
export function pick(samples, name, pred) {
  return samples.filter((s) => s.name === name && (!pred || pred(s.labels)));
}

export function single(samples, name) {
  const s = samples.find((x) => x.name === name);
  return s ? s.value : 0;
}
