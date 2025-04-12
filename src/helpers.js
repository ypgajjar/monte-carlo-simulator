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
  