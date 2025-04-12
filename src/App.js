// App.js
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { Trash2, PlusCircle, Play, Edit, XCircle, Plus, Minus } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale,
} from 'chart.js';
import { Random, MersenneTwister19937 } from 'random-js';
import ReactFlow from 'reactflow';
import 'reactflow/dist/style.css';
import SimulationResults from './SimulationResults';
import NetworkDiagram from './NetworkDiagram';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale
);

/* =================== CONSTANTS =================== */
const DEFAULT_SIMULATION_RUNS = 500;
const MIN_SLACK_TOLERANCE = 1e-6;
const DEPENDENCY_TYPES = ['FS', 'SS', 'FF', 'SF'];
const DISTRIBUTION_TYPES = ['Triangular', 'PERT', 'Normal', 'LogNormal'];
const MAX_TASKS = 100;
const GANTT_PERCENTILES = [10, 50, 90];


// Initialize random number generator with a browser-compatible engine
const random = new Random(MersenneTwister19937.autoSeed());

/* =================== DISTRIBUTION HELPER FUNCTIONS =================== */
// Triangular distribution sample using random-js
function randomTriangular(min, mode, max) {
  if (max === min) return min;
  const range = max - min;
  const clampedMode = Math.max(min, Math.min(mode, max));
  const c = (clampedMode - min) / range;
  const u = random.realZeroToOneExclusive();
  if (u < c) {
    return min + Math.sqrt(u * range * (clampedMode - min));
  } else {
    return max - Math.sqrt((1 - u) * range * (max - clampedMode));
  }
}

// Normal distribution sample using Box-Muller transform
function randomNormal(mean, stdDev) {
  if (stdDev < 0) {
    console.warn("Standard deviation cannot be negative. Returning mean.");
    return mean;
  }
  if (stdDev === 0) return mean;
  let u = 0, v = 0;
  while (u === 0) u = random.realZeroToOneExclusive();
  while (v === 0) v = random.realZeroToOneExclusive();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + stdDev * z;
}

// LogNormal distribution sample using the above normal sample
function randomLogNormal(mu, sigma) {
  if (sigma < 0) {
    console.warn("LogNormal sigma cannot be negative. Returning exp(mu).");
    return Math.exp(mu);
  }
  if (sigma === 0) return Math.exp(mu);
  return Math.exp(randomNormal(mu, sigma));
}

// PERT distribution sample using a Beta distribution approximation
function randomPERT(min, likely, max, gamma = 4) {
  if (max === min) return min;
  if (max < min || likely < min || likely > max) {
    console.warn("Invalid PERT params, returning likely:", { min, likely, max });
    return likely;
  }
  const range = max - min;
  const clampedLikely = Math.max(min, Math.min(likely, max));
  const mu = (min + gamma * clampedLikely + max) / (gamma + 2);
  let alpha, beta;
  if (mu === max || clampedLikely === mu) {
    alpha = gamma + 1;
    beta = 1;
  } else if (mu === min) {
    alpha = 1;
    beta = gamma + 1;
  } else {
    const muMinusMin = mu - min;
    const maxMinusMu = max - mu;
    const likelyMinusMu = clampedLikely - mu;
    if (likelyMinusMu === 0 || muMinusMin === 0 || range === 0) {
      console.warn("PERT calculation instability, falling back to Triangular.");
      return randomTriangular(min, clampedLikely, max);
    }
    alpha = (muMinusMin * (2 * clampedLikely - min - max)) / (likelyMinusMu * range);
    beta = (alpha * maxMinusMu) / muMinusMin;
  }
  if (!isFinite(alpha) || !isFinite(beta) || alpha <= 0 || beta <= 0) {
    console.warn(`Invalid Beta params (alpha: ${alpha}, beta: ${beta}), falling back to Triangular.`);
    return randomTriangular(min, clampedLikely, max);
  }
  const betaSample = random.beta(alpha, beta);
  return min + betaSample * range;
}

/* =================== HELPER FUNCTION: Percentiles =================== */
function getPercentiles(data, percentiles = [10, 50, 90]) {
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

/* =================== STATISTICAL HELPER FUNCTIONS =================== */
// Pearson correlation coefficient between two arrays
function pearsonCorrelation(x, y) {
  const n = x.length;
  if (n <= 1 || !x || !y || x.length !== y.length) return 0;
  const meanX = x.reduce((acc, val) => acc + val, 0) / n;
  const meanY = y.reduce((acc, val) => acc + val, 0) / n;
  const stdDevX = Math.sqrt(x.reduce((acc, val) => acc + (val - meanX) ** 2, 0) / (n - 1));
  const stdDevY = Math.sqrt(y.reduce((acc, val) => acc + (val - meanY) ** 2, 0) / (n - 1));
  if (stdDevX === 0 || stdDevY === 0) return 0;
  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (x[i] - meanX) * (y[i] - meanY);
  }
  const denominator = (n - 1) * stdDevX * stdDevY;
  if (denominator === 0) return 0;
  return Math.max(-1, Math.min(1, numerator / denominator));
}

// Calculate histogram bins and counts
function calculateHistogram(data, binCount = 20) {
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

/* =================== CPM & SIMULATION LOGIC =================== */
// CPM Calculation Function
function calculateCPM(tasks, runDurations) {
  const taskMap = {};
  tasks.forEach((task, index) => {
    taskMap[task.id] = { ...task, index, duration: runDurations[index] };
  });

  const adj = new Map();
  const revAdj = new Map();
  const nodes = new Set(['START', 'END']);

  tasks.forEach(task => {
    nodes.add(task.id);
    adj.set(task.id, []);
    revAdj.set(task.id, []);
  });
  adj.set('START', []);
  revAdj.set('END', []);

  tasks.forEach(task => {
    if (task.dependencies && task.dependencies.length > 0) {
      task.dependencies.forEach(dep => {
        const predId = dep.predecessorId;
        if (predId && adj.has(predId)) {
          adj.get(predId).push(task.id);
          revAdj.get(task.id).push(predId);
        } else {
          if (predId !== 'START') {
            console.warn(`Invalid predecessor ID ${predId} for task ${task.name}.`);
          }
        }
      });
      const actualPreds = revAdj.get(task.id)?.filter(p => p !== 'START') || [];
      if (actualPreds.length === 0) {
        adj.get('START').push(task.id);
        revAdj.get(task.id).push('START');
      }
    } else {
      adj.get('START').push(task.id);
      revAdj.get(task.id).push('START');
    }
  });

  tasks.forEach(task => {
    if (!adj.get(task.id) || adj.get(task.id).length === 0) {
      adj.get(task.id).push('END');
      revAdj.get('END').push(task.id);
    }
  });

  // Topological sort using Kahn's algorithm
  const inDegree = new Map();
  nodes.forEach(node => inDegree.set(node, 0));
  adj.forEach(successors => {
    successors.forEach(succ => {
      inDegree.set(succ, (inDegree.get(succ) || 0) + 1);
    });
  });
  const queue = [];
  nodes.forEach(node => { if (inDegree.get(node) === 0) queue.push(node); });
  const topoOrder = [];
  while (queue.length > 0) {
    const u = queue.shift();
    topoOrder.push(u);
    if (adj.has(u)) {
      adj.get(u).forEach(v => {
        inDegree.set(v, inDegree.get(v) - 1);
        if (inDegree.get(v) === 0) queue.push(v);
      });
    }
  }
  if (topoOrder.length !== nodes.size) {
    console.error("Cycle detected!");
    return null;
  }

  // Forward pass
  const es = new Map();
  const ef = new Map();
  nodes.forEach(node => { es.set(node, 0); ef.set(node, 0); });
  topoOrder.forEach(j => {
    if (j === 'START') return;
    const taskJ = taskMap[j];
    const durJ = j === 'END' ? 0 : Math.max(0, taskJ?.duration ?? 0);
    let earliestStartJ = 0;
    if (revAdj.has(j)) {
      revAdj.get(j).forEach(i => {
        const dependency = taskJ?.dependencies?.find(d => d.predecessorId === i);
        const depType = dependency?.type || 'FS';
        const lag = dependency?.lag || 0;
        let requiredStart = 0;
        const esI = es.get(i) || 0;
        const efI = ef.get(i) || 0;
        switch (depType) {
          case 'FS': requiredStart = efI + lag; break;
          case 'SS': requiredStart = esI + lag; break;
          case 'FF': requiredStart = efI + lag - durJ; break;
          case 'SF': requiredStart = esI + lag - durJ; break;
          default: requiredStart = efI + lag;
        }
        earliestStartJ = Math.max(earliestStartJ, requiredStart);
      });
    }
    es.set(j, earliestStartJ);
    ef.set(j, earliestStartJ + durJ);
  });
  const totalDuration = ef.get('END');

  // Backward pass
  const ls = new Map();
  const lf = new Map();
  nodes.forEach(node => { ls.set(node, totalDuration); lf.set(node, totalDuration); });
  ls.set('END', totalDuration);
  lf.set('END', totalDuration);
  [...topoOrder].reverse().forEach(i => {
    if (i === 'END') return;
    const taskI = taskMap[i];
    const durI = i === 'START' ? 0 : Math.max(0, taskI?.duration ?? 0);
    let latestFinishI = totalDuration;
    if (adj.has(i)) {
      adj.get(i).forEach(j => {
        const taskJ = taskMap[j];
        const dependency = taskJ?.dependencies?.find(d => d.predecessorId === i);
        const depType = dependency?.type || 'FS';
        const lag = dependency?.lag || 0;
        let requiredFinish = totalDuration;
        const lsJ = ls.get(j) ?? totalDuration;
        const lfJ = lf.get(j) ?? totalDuration;
        switch (depType) {
          case 'FS': requiredFinish = lsJ - lag; break;
          case 'SS': requiredFinish = lsJ - lag + durI; break;
          case 'FF': requiredFinish = lfJ - lag; break;
          case 'SF': requiredFinish = lfJ - lag + durI; break;
          default: requiredFinish = lsJ - lag;
        }
        latestFinishI = Math.min(latestFinishI, requiredFinish);
      });
    }
    lf.set(i, latestFinishI);
    ls.set(i, latestFinishI - durI);
  });

  // Enhanced Critical Path Detection
  const slack = new Map();
  nodes.forEach(node => {
    slack.set(node, ls.get(node) - es.get(node));
  });
  const projectFinish = ef.get('END');
  const criticalPathTasks = new Set();
  tasks.forEach(task => {
    const esVal = es.get(task.id);
    const lsVal = ls.get(task.id);
    const efVal = ef.get(task.id);
    const currentSlack = lsVal - esVal;
    if (
      Math.abs(currentSlack) < MIN_SLACK_TOLERANCE ||
      Math.abs(efVal - projectFinish) < MIN_SLACK_TOLERANCE
    ) {
      criticalPathTasks.add(task.id);
    }
  });
  const taskTimings = {};
  tasks.forEach(task => {
    taskTimings[task.id] = { es: es.get(task.id), ef: ef.get(task.id) };
  });
  return { totalDuration, criticalPathTasks, taskTimings };
}

// Main Simulation Function
function runMonteCarloSimulation(tasks, numRuns) {
  // Arrays for simulation results and for collecting per-run task timings
  const simulationRuns = [];
  const allTaskTimings = tasks.reduce((acc, task) => ({
    ...acc,
    [task.id]: { starts: [], finishes: [] }
  }), {});
  const taskDurationSamples = tasks.map(() => []);
  const taskCostSamples = tasks.map(() => []);
  
  // Array to count how often each task is on the critical path.
  const criticalCounts = tasks.map(() => 0);

  // Main Monte Carlo simulation loop
  for (let i = 0; i < numRuns; i++) {
    // Sample durations for each task based on its distribution
    const runDurations = tasks.map(task => {
      const { distType, duration, normalParams, logNormalParams } = task;
      try {
        switch (distType) {
          case 'Normal':
            return randomNormal(normalParams?.mean ?? 0, normalParams?.stdDev ?? 0);
          case 'LogNormal':
            return randomLogNormal(logNormalParams?.mu ?? 0, logNormalParams?.sigma ?? 0);
          case 'PERT':
            return randomPERT(duration?.min ?? 0, duration?.likely ?? 0, duration?.max ?? 0);
          case 'Triangular':
          default:
            return randomTriangular(duration?.min ?? 0, duration?.likely ?? 0, duration?.max ?? 0);
        }
      } catch (e) {
        console.error(`Sampling error for task ${task.name} in run ${i + 1}:`, e);
        return 0;
      }
    });
    
    // Sample costs for each task using triangular distribution
    const runCosts = tasks.map(task =>
      randomTriangular(task.cost?.min ?? 0, task.cost?.likely ?? 0, task.cost?.max ?? 0)
    );
    
    // Record the samples for sensitivity analysis
    tasks.forEach((_, idx) => {
      taskDurationSamples[idx].push(runDurations[idx]);
      taskCostSamples[idx].push(runCosts[idx]);
    });
    
    // Calculate the CPM results based on the sampled durations
    const cpmResult = calculateCPM(tasks, runDurations);
    if (cpmResult) {
      const { totalDuration, criticalPathTasks, taskTimings } = cpmResult;
      simulationRuns.push({
        totalDuration,
        totalCost: runCosts.reduce((s, c) => s + c, 0),
        criticalPathTasks
      });
      
      // Increment count if a task is on the critical path in this run
      tasks.forEach((task, idx) => {
        if (criticalPathTasks.has(task.id)) {
          criticalCounts[idx] += 1;
        }
      });
      
      // Record the individual task timings (start and finish)
      tasks.forEach(task => {
        if (allTaskTimings[task.id] && taskTimings[task.id]) {
          allTaskTimings[task.id].starts.push(taskTimings[task.id].es);
          allTaskTimings[task.id].finishes.push(taskTimings[task.id].ef);
        }
      });
    } else {
      // If CPM fails (e.g., due to a cycle), remove the last added samples
      tasks.forEach((_, idx) => {
        taskDurationSamples[idx].pop();
        taskCostSamples[idx].pop();
      });
    }
  }
  
  const validRuns = simulationRuns.length;
  if (validRuns === 0) {
    return {
      simulationRuns: [],
      analysis: null,
      taskDurationSamples: [],
      taskCostSamples: [],
      allTaskTimings: {}
    };
  }

  // Gather overall project duration and cost data
  const totalDurations = simulationRuns.map(r => r.totalDuration);
  const totalCosts = simulationRuns.map(r => r.totalCost);
  
  // Build the analysis object
  const analysis = {};
  analysis.meanDuration = totalDurations.reduce((a, b) => a + b, 0) / validRuns;
  analysis.stdDevDuration = Math.sqrt(
    totalDurations.reduce((acc, val) => acc + (val - analysis.meanDuration) ** 2, 0) / validRuns
  );
  analysis.meanCost = totalCosts.reduce((a, b) => a + b, 0) / validRuns;
  analysis.stdDevCost = Math.sqrt(
    totalCosts.reduce((acc, val) => acc + (val - analysis.meanCost) ** 2, 0) / validRuns
  );
  analysis.percentilesDuration = getPercentiles(totalDurations, [10, 25, 50, 75, 80, 90, 95]);
  analysis.percentilesCost = getPercentiles(totalCosts, [10, 25, 50, 75, 80, 90, 95]);
  analysis.durationSensitivity = tasks.map((_, idx) =>
    pearsonCorrelation(taskDurationSamples[idx] || [], totalDurations)
  );
  analysis.costSensitivity = tasks.map((_, idx) =>
    pearsonCorrelation(taskCostSamples[idx] || [], totalCosts)
  );
  
  // Calculate Criticality Index: proportion of runs in which a task is on the critical path
  analysis.criticalityIndex = criticalCounts.map(count => count / validRuns);
  
  analysis.scheduleSensitivityIndexProject = analysis.meanDuration > 0
    ? (analysis.stdDevDuration / analysis.meanDuration)
    : 0;
  analysis.scheduleSensitivityIndexTask = tasks.map((_, idx) =>
    (analysis.criticalityIndex[idx] || 0) * (analysis.durationSensitivity[idx] || 0)
  );
  analysis.durationCruciality = analysis.scheduleSensitivityIndexTask;

  return {
    simulationRuns,
    analysis,
    taskDurationSamples,
    taskCostSamples,
    allTaskTimings
  };
}


/* =================== UI COMPONENTS =================== */

// --- Task Form Component ---
function TaskForm({ onSaveTask, existingTasks, editingTask, onCancelEdit }) {
  const [taskName, setTaskName] = useState("");
  const [wbsCode, setWbsCode] = useState("");
  const [distType, setDistType] = useState("Triangular");
  const [durationMin, setDurationMin] = useState("");
  const [durationLikely, setDurationLikely] = useState("");
  const [durationMax, setDurationMax] = useState("");
  const [costMin, setCostMin] = useState("");
  const [costLikely, setCostLikely] = useState("");
  const [costMax, setCostMax] = useState("");
  const [normalMean, setNormalMean] = useState("");
  const [normalStdDev, setNormalStdDev] = useState("");
  const [logNormalMu, setLogNormalMu] = useState("");
  const [logNormalSigma, setLogNormalSigma] = useState("");
  const [dependencies, setDependencies] = useState([]);

  useEffect(() => {
    if (editingTask) {
      setTaskName(editingTask.name);
      setWbsCode(editingTask.wbs || "");
      setDistType(editingTask.distType || "Triangular");
      setDurationMin(editingTask.duration?.min ?? "");
      setDurationLikely(editingTask.duration?.likely ?? "");
      setDurationMax(editingTask.duration?.max ?? "");
      setCostMin(editingTask.cost?.min ?? "");
      setCostLikely(editingTask.cost?.likely ?? "");
      setCostMax(editingTask.cost?.max ?? "");
      setNormalMean(editingTask.normalParams?.mean ?? "");
      setNormalStdDev(editingTask.normalParams?.stdDev ?? "");
      setLogNormalMu(editingTask.logNormalParams?.mu ?? "");
      setLogNormalSigma(editingTask.logNormalParams?.sigma ?? "");
      setDependencies(Array.isArray(editingTask.dependencies) ? editingTask.dependencies : []);
    } else {
      setTaskName("");
      setWbsCode("");
      setDistType("Triangular");
      setDurationMin("");
      setDurationLikely("");
      setDurationMax("");
      setCostMin("");
      setCostLikely("");
      setCostMax("");
      setNormalMean("");
      setNormalStdDev("");
      setLogNormalMu("");
      setLogNormalSigma("");
      setDependencies([]);
    }
  }, [editingTask]);

  const addDependency = () => {
    setDependencies([...dependencies, { id: `dep_${Date.now()}_${random.integer(1000, 9999)}`, predecessorId: 'START', type: 'FS', lag: 0 }]);
  };
  const updateDependency = (depId, field, value) => {
    setDependencies(dependencies.map(dep => dep.id === depId ? { ...dep, [field]: field === 'lag' ? parseFloat(value) || 0 : value } : dep));
  };
  const removeDependency = (depId) => {
    setDependencies(dependencies.filter(dep => dep.id !== depId));
  };

  const renderDurationInputs = () => {
    switch (distType) {
      case 'Normal':
        return (
          <div className="grid grid-cols-2 gap-2">
            <input type="number" step="any" placeholder="Mean" value={normalMean} onChange={(e) => setNormalMean(e.target.value)} required className="p-2 border rounded-md" />
            <input type="number" step="any" min="0" placeholder="Std Dev" value={normalStdDev} onChange={(e) => setNormalStdDev(e.target.value)} required className="p-2 border rounded-md" />
          </div>
        );
      case 'LogNormal':
        return (
          <div className="grid grid-cols-2 gap-2">
            <input type="number" step="any" placeholder="Mu (ln scale)" value={logNormalMu} onChange={(e) => setLogNormalMu(e.target.value)} required className="p-2 border rounded-md" />
            <input type="number" step="any" min="0" placeholder="Sigma (ln scale)" value={logNormalSigma} onChange={(e) => setLogNormalSigma(e.target.value)} required className="p-2 border rounded-md" />
          </div>
        );
      case 'Triangular':
      case 'PERT':
      default:
        return (
          <div className="grid grid-cols-3 gap-2">
            <input type="number" step="any" min="0" placeholder="Min" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} required className="p-2 border rounded-md" />
            <input type="number" step="any" min="0" placeholder="Likely" value={durationLikely} onChange={(e) => setDurationLikely(e.target.value)} required className="p-2 border rounded-md" />
            <input type="number" step="any" min="0" placeholder="Max" value={durationMax} onChange={(e) => setDurationMax(e.target.value)} required className="p-2 border rounded-md" />
          </div>
        );
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
  
    // Validate WBS Code: Ensure it isn’t empty and isn’t duplicated.
    if (!wbsCode.trim()) {
      alert("WBS Code is required.");
      return;
    }
    const duplicateWBS = existingTasks.some(task =>
      task.wbs &&
      task.wbs.trim() === wbsCode.trim() &&
      (!editingTask || task.id !== editingTask.id)
    );
    if (duplicateWBS) {
      alert("WBS Code must be unique. This code is already used.");
      return;
    }
  
    // (Keep the rest of your validations and task data assembly)
    if ((distType === 'Triangular' || distType === 'PERT') &&
        (parseFloat(durationMin) > parseFloat(durationLikely) ||
         parseFloat(durationLikely) > parseFloat(durationMax))) {
      alert("Duration values must be Min <= Likely <= Max.");
      return;
    }
    if (distType === 'Normal' && parseFloat(normalStdDev) < 0) {
      alert("Normal distribution std dev cannot be negative.");
      return;
    }
    if (distType === 'LogNormal' && parseFloat(logNormalSigma) < 0) {
      alert("LogNormal sigma cannot be negative.");
      return;
    }
    if (parseFloat(costMin) > parseFloat(costLikely) || parseFloat(costLikely) > parseFloat(costMax)) {
      alert("Cost values must be Min <= Likely <= Max.");
      return;
    }
    if (dependencies.some(dep => dep.predecessorId === (editingTask ? editingTask.id : null))) {
      alert("A task cannot depend on itself.");
      return;
    }
    
    const taskData = {
      id: editingTask ? editingTask.id : `task_${Date.now()}_${random.integer(1000, 9999)}`,
      name: taskName || `Task ${existingTasks.length + 1}`,
      wbs: wbsCode, // Will now be validated as unique.
      distType,
      duration: {
        min: parseFloat(durationMin) || 0,
        likely: parseFloat(durationLikely) || 0,
        max: parseFloat(durationMax) || 0
      },
      normalParams: { mean: parseFloat(normalMean) || 0, stdDev: parseFloat(normalStdDev) || 0 },
      logNormalParams: { mu: parseFloat(logNormalMu) || 0, sigma: parseFloat(logNormalSigma) || 0 },
      cost: {
        min: parseFloat(costMin) || 0,
        likely: parseFloat(costLikely) || 0,
        max: parseFloat(costMax) || 0
      },
      dependencies: dependencies.filter(dep => dep.predecessorId) || [],
    };
    
    onSaveTask(taskData, !!editingTask);
    if (!editingTask) {
      setTaskName("");
      setWbsCode("");
      setDistType("Triangular");
      setDurationMin("");
      setDurationLikely("");
      setDurationMax("");
      setCostMin("");
      setCostLikely("");
      setCostMax("");
      setNormalMean("");
      setNormalStdDev("");
      setLogNormalMu("");
      setLogNormalSigma("");
      setDependencies([]);
    } else {
      onCancelEdit();
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="p-4 border rounded-lg mb-6 shadow bg-white">
      <h3 className="text-xl font-semibold mb-4">{editingTask ? 'Edit Task' : 'Add New Task'}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block mb-1">Task Name</label>
          <input type="text" placeholder="Enter task name" value={taskName} onChange={(e) => setTaskName(e.target.value)} required className="w-full p-2 border rounded-md" />
        </div>
        <div>
          <label className="block mb-1">WBS Code</label>
          <input type="text" placeholder="e.g., 1.1.2" value={wbsCode} onChange={(e) => setWbsCode(e.target.value)} className="w-full p-2 border rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block mb-1">Duration Distribution</label>
          <select value={distType} onChange={(e) => setDistType(e.target.value)} className="w-full p-2 border rounded-md">
            {DISTRIBUTION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
        <div>
          <label className="block mb-1">Duration Parameters</label>
          {renderDurationInputs()}
        </div>
      </div>
      <div className="mb-4">
        <label className="block mb-1">Cost (Min, Likely, Max)</label>
        <div className="grid grid-cols-3 gap-2">
          <input type="number" placeholder="Min" value={costMin} onChange={(e) => setCostMin(e.target.value)} required className="p-2 border rounded-md" />
          <input type="number" placeholder="Likely" value={costLikely} onChange={(e) => setCostLikely(e.target.value)} required className="p-2 border rounded-md" />
          <input type="number" placeholder="Max" value={costMax} onChange={(e) => setCostMax(e.target.value)} required className="p-2 border rounded-md" />
        </div>
      </div>
      <div className="mb-4 p-3 border-dashed border rounded-md bg-gray-50">
        <h4 className="text-md font-semibold mb-2">Dependencies</h4>
        {dependencies.length === 0 && <p className="text-sm italic">No predecessors defined (task starts at project beginning).</p>}
        {dependencies.map((dep, index) => (
          <div key={dep.id} className="grid grid-cols-10 gap-2 items-center mb-2 p-2 border-b">
            <div className="col-span-4">
              {index === 0 && <label className="text-xs block">Predecessor</label>}
              <select value={dep.predecessorId} onChange={(e) => updateDependency(dep.id, 'predecessorId', e.target.value)} className="w-full p-1.5 border rounded-md">
                <option value="">-- Select --</option>
                {existingTasks.filter(task => !editingTask || task.id !== editingTask.id).map(task => (
                  <option key={task.id} value={task.id}>{task.name} ({task.wbs || 'No WBS'})</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              {index === 0 && <label className="text-xs block">Type</label>}
              <select value={dep.type} onChange={(e) => updateDependency(dep.id, 'type', e.target.value)} className="w-full p-1.5 border rounded-md" disabled={!dep.predecessorId || dep.predecessorId === 'START'}>
                {DEPENDENCY_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              {index === 0 && <label className="text-xs block">Lag/Lead</label>}
              <input type="number" value={dep.lag} onChange={(e) => updateDependency(dep.id, 'lag', e.target.value)} className="w-full p-1.5 border rounded-md" disabled={!dep.predecessorId || dep.predecessorId === 'START'} />
            </div>
            <div className="col-span-2 text-right">
              {index === 0 && <label className="text-xs block">&nbsp;</label>}
              <button type="button" onClick={() => removeDependency(dep.id)} className="text-red-500 p-1 focus:outline-none" aria-label="Remove dependency">
                <Minus size={16} />
              </button>
            </div>
          </div>
        ))}
        <button type="button" onClick={addDependency} className="mt-2 inline-flex items-center px-2 py-1 bg-gray-200 text-sm rounded hover:bg-gray-300">
          <Plus size={16} className="mr-1" /> Add Dependency
        </button>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        {editingTask && (
          <button type="button" onClick={onCancelEdit} className="inline-flex items-center px-4 py-2 bg-gray-200 text-sm rounded shadow hover:bg-gray-300">
            <XCircle size={18} className="mr-2" /> Cancel Edit
          </button>
        )}
        <button type="submit" className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm rounded shadow hover:bg-blue-700">
          <PlusCircle size={18} className="mr-2" /> {editingTask ? 'Save Changes' : 'Add Task'}
        </button>
      </div>
    </form>
  );
}

// --- Task List Component ---
function TaskList({ tasks, onDeleteTask, onEditTask }) {
  // Helper function to parse a WBS code into an array of numeric parts
  const parseWbsCode = (wbs) => {
    // If a task has no WBS code, return a high value so it sorts to the bottom
    if (!wbs) return [999999];
    // Split on '.' and convert each part to a number; default to 0 for safety
    return wbs.split('.').map(part => parseInt(part.trim(), 10) || 0);
  };

  // Compare two parsed WBS arrays (a and b)
  const compareWbsArrays = (a, b) => {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      if (a[i] < b[i]) return -1;  // a should come before b
      if (a[i] > b[i]) return 1;   // a should come after b
    }
    // If all compared parts are equal, the shorter array is “lesser”
    return a.length - b.length;
  };

  // Sort tasks by their WBS codes
  const sortedTasks = [...tasks].sort((taskA, taskB) => {
    const wbsA = parseWbsCode(taskA.wbs);
    const wbsB = parseWbsCode(taskB.wbs);
    return compareWbsArrays(wbsA, wbsB);
  });

  // Helper function for displaying dependencies
  const getTaskNameById = (id, tasks) => {
    if (id === 'START') return 'Project Start';
    const task = tasks.find(t => t.id === id);
    return task ? task.name : 'Unknown';
  };

  const formatDependencies = (dependencies, tasks) => {
    if (!dependencies || dependencies.length === 0) return 'None (Start Task)';
    return dependencies
      .map(dep => `${getTaskNameById(dep.predecessorId, tasks)} (${dep.type} Lag: ${dep.lag})`)
      .join('; ');
  };

  return (
    <div className="mb-6">
      <h3 className="text-xl font-semibold mb-3">
        Task List ({tasks.length}/{MAX_TASKS})
      </h3>
      {tasks.length === 0 ? (
        <p className="italic text-sm">No tasks added yet.</p>
      ) : (
        <ul className="space-y-2">
          {sortedTasks.map(task => (
            <li
              key={task.id}
              className="flex items-center justify-between p-3 bg-gray-50 border rounded-md shadow hover:bg-gray-100"
            >
              <div className="flex-grow mr-4">
                <strong>{task.name}</strong>{" "}
                {task.wbs && (
                  <span className="text-xs bg-gray-200 px-1.5 py-0.5 rounded ml-2">
                    {task.wbs}
                  </span>
                )}
                <span className="text-sm ml-2">({task.distType})</span>
                <p className="text-xs mt-1">
                  {task.distType === 'Normal'
                    ? `Dur: N(μ=${task.normalParams?.mean}, σ=${task.normalParams?.stdDev})`
                    : task.distType === 'LogNormal'
                    ? `Dur: LN(μ=${task.logNormalParams?.mu}, σ=${task.logNormalParams?.sigma})`
                    : `Dur: ${task.duration.min}/${task.duration.likely}/${task.duration.max}`}
                  {" | "}
                  Cost: {task.cost.min}/{task.cost.likely}/{task.cost.max}
                </p>
                <p className="text-sm mt-1 break-words">
                  Deps:{" "}
                  <span className="font-medium">
                    {formatDependencies(task.dependencies, tasks)}
                  </span>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onEditTask(task)}
                  className="text-blue-600 hover:text-blue-800"
                  aria-label={`Edit ${task.name}`}
                >
                  <Edit size={18} />
                </button>
                <button
                  onClick={() => onDeleteTask(task.id)}
                  className="text-red-500 hover:text-red-700"
                  aria-label={`Delete ${task.name}`}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SimpleNetworkDiagram({ tasks }) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);

  useEffect(() => {
    const newNodes = tasks.map((task, index) => ({
      id: task.id,
      data: { label: `${task.name}${task.wbs ? ` (${task.wbs})` : ''}` },
      position: { x: (index % 5) * 200, y: Math.floor(index / 5) * 120 },
      style: { background: '#fff', border: '1px solid #ddd', borderRadius: '4px', padding: '5px 10px', fontSize: '10px', minWidth: '100px', textAlign: 'center' }
    }));
    const newEdges = [];
    tasks.forEach(task => {
      if (task.dependencies && task.dependencies.length > 0) {
        task.dependencies.forEach(dep => {
          if (dep.predecessorId && dep.predecessorId !== 'START' && tasks.some(t => t.id === dep.predecessorId)) {
            newEdges.push({
              source: dep.predecessorId,
              target: task.id,
              label: `${dep.type}${dep.lag ? ` (Lag: ${dep.lag})` : ''}`,
              style: { strokeWidth: 1.5, stroke: '#b1b1b7' },
              markerEnd: { type: 'arrowclosed', color: '#b1b1b7' }
            });
          }
        });
      }
    });
    setNodes(newNodes);
    setEdges(newEdges);
  }, [tasks]);

  if (tasks.length === 0) return null;

  return (
    <div className="mb-8 p-4 border rounded-lg bg-gray-50" style={{ height: 400 }}>
      <h3 className="text-xl font-semibold mb-4">Task Network Diagram</h3>
      <ReactFlow 
        nodes={nodes} 
        edges={edges}
        fitView
        nodesDraggable
        nodesConnectable={false}
      >
        {/* Optionally you can include MiniMap, Controls, Background */}
      </ReactFlow>
    </div>
  );
}

// We'll use the simplified version:
// Uncomment the following line if you want to use SimpleNetworkDiagram instead of the custom one:
// import SimpleNetworkDiagram from './SimpleNetworkDiagram';
// For now we'll assume NetworkDiagram is the simplified one.
  
// --- Probabilistic Gantt Chart Component ---
function ProbabilisticGanttChart({ tasks, taskTimings, percentiles = GANTT_PERCENTILES }) {
  const { ganttChartJsData, percentileData, pLow, pHigh } = useMemo(() => {
    if (!taskTimings || Object.keys(taskTimings).length === 0 || tasks.length === 0) {
      return { ganttChartJsData: null, percentileData: null, pLow: 0, pHigh: 0 };
    }
    const pData = {};
    tasks.forEach(task => {
      if (taskTimings[task.id]) {
        pData[task.id] = {
          start: getPercentiles(taskTimings[task.id].starts, percentiles),
          finish: getPercentiles(taskTimings[task.id].finishes, percentiles)
        };
      }
    });
    const labels = tasks.map(task => `${task.name}${task.wbs ? ` (${task.wbs})` : ''}`);
    const datasets = [];
    const pLow = Math.min(...percentiles);
    const pHigh = Math.max(...percentiles);
    datasets.push({
      label: `Start (Before P${pLow})`,
      data: tasks.map(task => pData[task.id]?.start[pLow] ?? 0),
      backgroundColor: 'rgba(0, 0, 0, 0)',
      borderColor: 'rgba(0, 0, 0, 0)',
      barPercentage: 0.6,
      categoryPercentage: 0.8,
    });
    datasets.push({
      label: `Duration Range (P${pLow}-P${pHigh})`,
      data: tasks.map(task => {
        const start = pData[task.id]?.start[pLow] ?? 0;
        const end = pData[task.id]?.finish[pHigh] ?? 0;
        return Math.max(0.1, end - start);
      }),
      backgroundColor: 'rgba(54, 162, 235, 0.5)',
      borderColor: 'rgba(54, 162, 235, 1)',
      borderWidth: 1,
      barPercentage: 0.6,
      categoryPercentage: 0.8,
    });
    return { ganttChartJsData: { labels, datasets }, percentileData: pData, pLow, pHigh };
  }, [tasks, taskTimings, percentiles]);

  if (!ganttChartJsData || !percentileData) return null;

  const options = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: function(context) {
            const taskIndex = context.dataIndex;
            const taskId = tasks[taskIndex]?.id;
            const taskPData = percentileData[taskId];
            if (!taskPData) return 'No percentile data';
            const pVals = percentiles.map(p => `P${p}: ${taskPData.start[p]?.toFixed(1)} - ${taskPData.finish[p]?.toFixed(1)}`).join(' | ');
            return context.datasetIndex === 1 ? `P${pLow}-P${pHigh} Range | ${pVals}` : '';
          }
        }
      }
    },
    scales: {
      x: {
        stacked: true,
        title: { display: true, text: 'Project Timeline (days)' },
        beginAtZero: true,
      },
      y: { stacked: true }
    }
  };

  return (
    <div className="mb-8 p-4 border rounded-lg bg-gray-50 shadow" style={{ height: `${Math.max(200, tasks.length * 35 + 50)}px` }}>
      <h3 className="text-xl font-semibold mb-4">Probabilistic Gantt Chart (P{Math.min(...percentiles)}-P{Math.max(...percentiles)} Range)</h3>
      <Bar data={ganttChartJsData} options={options} />
    </div>
  );
}


// --- Main App Component ---
function App() {
  const [tasks, setTasks] = useState([]);
  const [numRuns, setNumRuns] = useState(DEFAULT_SIMULATION_RUNS);
  const [confidenceLevel, setConfidenceLevel] = useState(80);
  const [simulationResults, setSimulationResults] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [allTaskTimings, setAllTaskTimings] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  
  const handleSaveTask = useCallback((taskData, isEditing) => {
    if (!isEditing && tasks.length >= MAX_TASKS) {
      setError(`Cannot add more than ${MAX_TASKS} tasks.`);
      return;
    }
    setTasks(prevTasks =>
      isEditing
        ? prevTasks.map(task => (task.id === taskData.id ? taskData : task))
        : [...prevTasks, taskData]
    );
    setEditingTask(null);
    setSimulationResults(null);
    setAnalysis(null);
    setAllTaskTimings({});
    setError(null);
  }, [tasks.length]);

  const handleEditTask = useCallback(taskToEdit => {
    setEditingTask(taskToEdit);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingTask(null);
  }, []);

  const deleteTask = useCallback(taskIdToDelete => {
    setTasks(prevTasks =>
      prevTasks
        .filter(task => task.id !== taskIdToDelete)
        .map(task => {
          const updatedDependencies = task.dependencies?.filter(dep => dep.predecessorId !== taskIdToDelete);
          return { ...task, dependencies: updatedDependencies };
        })
    );
    if (editingTask && editingTask.id === taskIdToDelete) setEditingTask(null);
    setSimulationResults(null);
    setAnalysis(null);
    setAllTaskTimings({});
    setError(null);
  }, [editingTask]);

  const runSimulation = useCallback(() => {
    if (tasks.length === 0) {
      setError("Please add at least one task.");
      return;
    }
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    for (const task of tasks) {
      if (task.dependencies) {
        for (const dep of task.dependencies) {
          const predecessor = taskMap.get(dep.predecessorId);
          if (predecessor?.dependencies?.some(pDep => pDep.predecessorId === task.id)) {
            setError(`Direct cycle detected: Task "${task.name}" and Task "${predecessor.name}" depend on each other.`);
            return;
          }
        }
      }
    }
    setIsLoading(true);
    setError(null);
    setSimulationResults(null);
    setAnalysis(null);
    setAllTaskTimings({});
    setTimeout(() => {
      try {
        const { simulationRuns: simRuns, analysis: simAnalysis, allTaskTimings: timings } = runMonteCarloSimulation(tasks, numRuns);
        if (simRuns && simRuns.length > 0 && simAnalysis) {
          setSimulationResults(simRuns);
          setAnalysis(simAnalysis);
          setAllTaskTimings(timings || {});
        } else if (simRuns === null) {
          setError("Simulation failed: A cycle was detected in task dependencies.");
        } else {
          setError("Simulation completed but produced no valid results.");
        }
      } catch (err) {
        console.error("Simulation Error:", err);
        setError(`Simulation error: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    }, 50);
  }, [tasks, numRuns]);

  return (
    <div className="container mx-auto p-4 bg-gray-100 min-h-screen">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold">Probabilistic Project Forecasting Tool - Monte Carlo Simulation</h1>
        <p className="mt-2 text-gray-600">Simulate, analyze, and visualize uncertainty in project timelines, budgets, and risks using Monte Carlo Simulation.</p>
      </header>
      <div className="mb-6 p-4 bg-white rounded-lg shadow border">
        <label htmlFor="numRunsInput" className="block mb-1 text-sm">Simulation Runs:</label>
        <input id="numRunsInput" type="number" value={numRuns} onChange={(e) => setNumRuns(Math.max(10, parseInt(e.target.value) || DEFAULT_SIMULATION_RUNS))} className="w-32 p-2 border rounded-md" />       
      </div>
      <div className="mb-6 p-4 bg-white rounded-lg shadow border">
        <label htmlFor="confidenceLevelInput" className="block mb-1 text-sm font-medium">
          Confidence Level (%):
        </label>
        <input
          id="confidenceLevelInput"
          type="number"
          value={confidenceLevel}
          onChange={(e) =>
            setConfidenceLevel(Math.max(0, Math.min(100, parseFloat(e.target.value) || 80)))
          }
          className="w-32 p-2 border rounded-md"
        />
        <p className="mt-1 text-xs text-gray-600 italic">
          Confidence Level represents how certain you want to be about meeting the project’s schedule and budget targets. For example, entering '80' means you seek an 80% likelihood (probability) that the project will finish within the stated duration and budget.
        </p>
      </div>

      <TaskForm onSaveTask={handleSaveTask} existingTasks={tasks} editingTask={editingTask} onCancelEdit={handleCancelEdit} />
      <TaskList tasks={tasks} onDeleteTask={deleteTask} onEditTask={handleEditTask} />

      {/* Render the simplified Network Diagram */}
      {tasks.length > 0 && <NetworkDiagram tasks={tasks} />}

      <div className="text-center my-6">
        <button onClick={runSimulation} disabled={isLoading || tasks.length === 0} className="inline-flex items-center px-6 py-3 bg-green-600 text-white rounded-md shadow hover:bg-green-700 disabled:opacity-50">
          {isLoading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Running...
            </>
          ) : (
            <>
              <Play size={18} className="mr-2" /> Run Simulation
            </>
          )}
        </button>
      </div>
      {error && (
        <div className="my-4 p-4 bg-red-100 border text-red-800 rounded-md shadow">
          <strong>Error:</strong> {error}
        </div>
      )}
      {isLoading && (
        <div className="text-center my-4 text-gray-600">
          <p>Simulation running...</p>
        </div>
      )}
      {!isLoading && simulationResults && analysis && (
        <SimulationResults
        simulationRuns={simulationResults}
        analysis={analysis}
        tasks={tasks}
        numRuns={numRuns}
        allTaskTimings={allTaskTimings}
        confidenceLevel={confidenceLevel}  // New prop added here
      />
)}

      <footer className="mt-12 text-center text-sm text-gray-500">
        <p>Monte Carlo Simulation Tool v1.0</p>
      </footer>
    </div>
  );
}

export default App;
