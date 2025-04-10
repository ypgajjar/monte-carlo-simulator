// App.js
import React, { useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import { Chart as ChartJS, registerables } from "chart.js";
ChartJS.register(...registerables);

// -------------- Statistical Helper Functions --------------

// Triangular distribution sample
function randomTriangular(min, mode, max) {
  const u = Math.random();
  const c = (mode - min) / (max - min);
  if (u < c) {
    return min + Math.sqrt(u * (max - min) * (mode - min));
  } else {
    return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
  }
}

// Normal distribution sample using Box-Muller
function randomNormal(mean, std) {
  let u = 0, v = 0;
  while(u === 0) u = Math.random();
  while(v === 0) v = Math.random();
  const standardNormal = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + std * standardNormal;
}

// Uniform distribution sample
function randomUniform(min, max) {
  return min + Math.random() * (max - min);
}

// Lognormal distribution sample: exponentiate a normal sample
function randomLognormal(mean, std) {
  return Math.exp(randomNormal(mean, std));
}

// (Placeholder) Beta distribution sample – for a full implementation, consider using a library.
function randomBeta(alpha, beta, min, max) {
  // Simple approximation: using uniform sample as placeholder
  return randomUniform(min, max);
}

// PERT distribution sample can be approximated by a modified Beta distribution.
// (For demonstration, we use triangular parameters.)
function randomPERT(min, mode, max) {
  return randomTriangular(min, mode, max);
}

// -------------- Pearson Correlation --------------
function pearsonCorrelation(x, y) {
  const n = x.length;
  const avgX = x.reduce((sum, v) => sum + v, 0) / n;
  const avgY = y.reduce((sum, v) => sum + v, 0) / n;
  let numerator = 0,
    denomX = 0,
    denomY = 0;
  for (let i = 0; i < n; i++) {
    numerator += (x[i] - avgX) * (y[i] - avgY);
    denomX += Math.pow(x[i] - avgX, 2);
    denomY += Math.pow(y[i] - avgY, 2);
  }
  return numerator / Math.sqrt(denomX * denomY);
}

// -------------- Simulation Engine --------------
/*
  Each task is an object with:
   - name: string
   - distribution: one of "triangular", "PERT", "normal", "lognormal", "uniform", "beta"
   - parameters: {min, mode, max} for triangular/PERT; {mean, std} for normal/lognormal; {min, max} for uniform; for beta: {alpha, beta, min, max}
   - costFactor (optional) for cost sensitivity analysis.
   - dependency: (if needed) for now we assume sequential execution.
*/
function simulateTask(task) {
  switch (task.distribution) {
    case "triangular":
      return randomTriangular(task.min, task.mode, task.max);
    case "PERT":
      return randomPERT(task.min, task.mode, task.max);
    case "normal":
      return randomNormal(task.mean, task.std);
    case "lognormal":
      return randomLognormal(task.mean, task.std);
    case "uniform":
      return randomUniform(task.min, task.max);
    case "beta":
      return randomBeta(task.alpha, task.beta, task.min, task.max);
    default:
      return task.min; // fallback
  }
}

/*
  Runs a simulation for a set of tasks.
  For simplicity, tasks are executed sequentially.
  Returns an object with:
    - total: total project duration
    - taskValues: a map from task name to simulated duration
    - cost: simulated project cost (if costFactor provided)
*/
function runSimulation(tasks) {
  let total = 0;
  let totalCost = 0;
  const taskValues = {};
  tasks.forEach((task) => {
    const d = simulateTask(task);
    taskValues[task.name] = d;
    total += d; // For sequential tasks, add durations.
    if (task.costFactor) {
      totalCost += d * task.costFactor;
    }
  });
  return { total, taskValues, cost: totalCost };
}

// Run Monte Carlo simulation over N iterations.
// Returns an array of detailed simulation results.
function monteCarloSimulation(tasks, numRuns) {
  const simulationDetails = [];
  for (let i = 0; i < numRuns; i++) {
    simulationDetails.push(runSimulation(tasks));
  }
  return simulationDetails;
}

// Compute sensitivity analysis: Pearson correlation between each task's simulated duration and the overall project duration.
function sensitivityAnalysis(simulationDetails, tasks) {
  const numSimulations = simulationDetails.length;
  const totalDurations = simulationDetails.map((sim) => sim.total);
  const sensitivityResults = {};
  tasks.forEach((task) => {
    const taskSamples = simulationDetails.map((sim) => sim.taskValues[task.name]);
    sensitivityResults[task.name] = pearsonCorrelation(taskSamples, totalDurations);
  });
  return sensitivityResults;
}

// -------------- React Component --------------
function App() {
  // Sample tasks; these can be extended or dynamically added via a form
  const [tasks, setTasks] = useState([
    {
      name: "Foundation",
      distribution: "triangular",
      min: 10,
      mode: 12,
      max: 16,
      costFactor: 10000,
    },
    {
      name: "Framing",
      distribution: "PERT",
      min: 20,
      mode: 25,
      max: 35,
      costFactor: 12000,
    },
    {
      name: "Finishing",
      distribution: "normal",
      mean: 15,
      std: 3,
      costFactor: 8000,
    },
  ]);
  const [numRuns, setNumRuns] = useState(1000);
  const [simulationData, setSimulationData] = useState([]);
  const [sensitivity, setSensitivity] = useState({});
  const [probabilityStatement, setProbabilityStatement] = useState("");

  // Run simulation on button click
  const runSimulationHandler = () => {
    const results = monteCarloSimulation(tasks, numRuns);
    setSimulationData(results);
    // Compute sensitivity
    const sens = sensitivityAnalysis(results, tasks);
    setSensitivity(sens);

    // Compute probability statement (e.g., 80% chance to finish on or before X days)
    // For example, take the 80th percentile of project durations
    const totals = results.map((r) => r.total).sort((a, b) => a - b);
    const index = Math.floor(0.8 * totals.length);
    const duration80 = totals[index];
    setProbabilityStatement(`There is an 80% chance the project will finish on or before ${duration80.toFixed(2)} days.`);
  };

  // Prepare histogram data for project durations
  const histogramData = {
    labels: simulationData.slice(0, 20).map((_, index) => index), // dummy labels (improve later)
    datasets: [
      {
        label: "Project Duration (days)",
        data: simulationData.map((s) => s.total),
        backgroundColor: "rgba(75,192,192,0.4)",
      },
    ],
  };

  // Prepare sensitivity data for a simple bar chart
  const sensitivityData = {
    labels: Object.keys(sensitivity),
    datasets: [
      {
        label: "Duration Sensitivity (Pearson Corr.)",
        data: Object.values(sensitivity),
        backgroundColor: "rgba(153,102,255,0.6)",
      },
    ],
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <header className="mb-4">
        <h1 className="text-3xl font-bold text-center">Monte Carlo Simulator for Construction</h1>
      </header>
      <main className="container mx-auto">
        <section className="mb-8 p-4 bg-white rounded shadow">
          <h2 className="text-2xl font-semibold mb-2">Simulation Settings</h2>
          <div className="mb-4">
            <label className="block font-medium">Number of Simulation Runs:</label>
            <input
              type="number"
              value={numRuns}
              onChange={(e) => setNumRuns(parseInt(e.target.value))}
              className="border p-2 rounded w-40"
            />
          </div>
          {/* For brevity, task editing form can be expanded.
              Here we simply list tasks; in a real app, allow add/edit/delete */}
          <div className="mb-4">
            <h3 className="text-xl font-medium">Tasks</h3>
            <ul>
              {tasks.map((task, idx) => (
                <li key={idx} className="mb-2">
                  <strong>{task.name}</strong>: {task.distribution} &nbsp;
                  {task.distribution === "triangular" || task.distribution === "PERT" ? (
                    <span>
                      [Min: {task.min}, Mode: {task.mode}, Max: {task.max}]
                    </span>
                  ) : task.distribution === "normal" || task.distribution === "lognormal" ? (
                    <span>
                      [Mean: {task.mean}, Std: {task.std}]
                    </span>
                  ) : task.distribution === "uniform" ? (
                    <span>
                      [Min: {task.min}, Max: {task.max}]
                    </span>
                  ) : task.distribution === "beta" ? (
                    <span>
                      [α: {task.alpha}, β: {task.beta}, Min: {task.min}, Max: {task.max}]
                    </span>
                  ) : null}
                  &nbsp; Cost Factor: {task.costFactor}
                </li>
              ))}
            </ul>
          </div>
          <button
            onClick={runSimulationHandler}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Run Simulation
          </button>
        </section>

        {simulationData.length > 0 && (
          <>
            <section className="mb-8 p-4 bg-white rounded shadow">
              <h2 className="text-2xl font-semibold mb-2">Simulation Results</h2>
              <p className="mb-4 font-medium">{probabilityStatement}</p>
              <div className="mb-4">
                <h3 className="text-xl font-medium mb-2">Duration Distribution Histogram</h3>
                <Bar data={histogramData} />
              </div>
            </section>
            <section className="mb-8 p-4 bg-white rounded shadow">
              <h2 className="text-2xl font-semibold mb-2">Sensitivity Analysis</h2>
              <p className="mb-4">
                (Correlation between each task's simulated duration and total project duration)
              </p>
              <div className="mb-4">
                <Line data={sensitivityData} />
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left border-collapse">
                  <thead>
                    <tr>
                      <th className="border p-2">Task</th>
                      <th className="border p-2">Duration Sensitivity (Pearson Corr.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(sensitivity).map(([taskName, value]) => (
                      <tr key={taskName}>
                        <td className="border p-2">{taskName}</td>
                        <td className="border p-2">{(value * 100).toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
      <footer className="text-center mt-4 text-gray-600">
        &copy; {new Date().getFullYear()} Monte Carlo Construction Simulator
      </footer>
    </div>
  );
}

export default App;
