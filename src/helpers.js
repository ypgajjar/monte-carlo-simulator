// helpers.js

export function getPercentiles(data, percentiles = [10, 50, 90]) {
  if (!data || data.length === 0) {
    return percentiles.reduce((acc, p) => ({ ...acc, [p]: NaN }), {});
  }
  const sortedData = [...data].sort((a, b) => a - b);
  const n = sortedData.length;
  const results = {};
  percentiles.forEach(p => {
    const rank = (p / 100) * (n - 1);
    const lowerIndex = Math.floor(rank);
    const upperIndex = Math.ceil(rank);
    const weight = rank - lowerIndex;
    if (upperIndex >= n) {
      results[p] = sortedData[n - 1];
    } else if (lowerIndex < 0) {
      results[p] = sortedData[0];
    } else {
      results[p] = sortedData[lowerIndex] * (1 - weight) + sortedData[upperIndex] * weight;
    }
  });
  return results;
}

export function calculateHistogram(data, binCount = 20) {
  if (!data || data.length === 0) return { labels: [], counts: [] };
  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  if (minVal === maxVal) return { labels: [minVal.toFixed(2)], counts: [data.length] };
  const range = maxVal - minVal;
  const effectiveBinCount = Math.min(binCount, Math.max(1, binCount));
  const binWidth = range / effectiveBinCount;
  const bins = Array(effectiveBinCount).fill(0);
  const labels = [];
  for (let i = 0; i < effectiveBinCount; i++) {
    const binStart = minVal + i * binWidth;
    const binEnd = binStart + binWidth;
    labels.push(`${binStart.toFixed(1)}-${binEnd.toFixed(1)}`);
  }
  data.forEach(value => {
    let binIndex = Math.floor((value - minVal) / binWidth);
    if (binIndex === effectiveBinCount) binIndex--;
    binIndex = Math.max(0, Math.min(binIndex, effectiveBinCount - 1));
    bins[binIndex]++;
  });
  return { labels, counts: bins };
}

export function randomPERT(min, likely, max, gamma = 4) {
  if (max === min) return min;
  if (max < min || likely < min || likely > max) {
    console.warn("Invalid PERT params, returning likely:", { min, likely, max });
    return likely;
  }

  const range = max - min;
  const mu = (min + gamma * likely + max) / (gamma + 2);
  const v = mu - min;
  const w = max - mu;

  const alpha = ((v * (2 * likely - min - max)) / (range * (likely - mu))) || 1;
  const beta = ((alpha * w) / v) || 1;

  if (!isFinite(alpha) || !isFinite(beta) || alpha <= 0 || beta <= 0) {
    console.warn("Invalid beta parameters (α=" + alpha + ", β=" + beta + "), falling back to triangular.");
    return (min + likely + max) / 3;
  }

  // Simple beta sampler (uses 2 uniform distributions)
  const u1 = Math.random();
  const u2 = Math.random();
  const x = Math.pow(u1, 1 / alpha);
  const y = Math.pow(u2, 1 / beta);
  const betaSample = x / (x + y);

  const pertSample = min + betaSample * range;

  return pertSample;
}
