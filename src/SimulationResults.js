import React, { useMemo } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { calculateHistogram, getPercentiles } from './helpers'; // Import helper functions once
import ProbabilisticGanttChart from './ProbabilisticGanttChart'; // Import once

function SimulationResults({
  simulationRuns,
  analysis,
  tasks,
  numRuns,
  allTaskTimings,
  confidenceLevel  // Changed from stakeholderProbability to confidenceLevel
}) {
  // Create chart data using useMemo to avoid unnecessary recalculations
  const { durationHistogramData, costHistogramData, sCurveDurationData, sCurveCostData, tornadoData } = useMemo(() => {
    if (!simulationRuns || simulationRuns.length === 0 || !analysis || !tasks) {
      return {
        durationHistogramData: null,
        costHistogramData: null,
        sCurveDurationData: null,
        sCurveCostData: null,
        tornadoData: null
      };
    }
    const validRuns = simulationRuns.length;
    const totalDurations = simulationRuns.map(r => r.totalDuration);
    const totalCosts = simulationRuns.map(r => r.totalCost);

    // Duration histogram
    const durHist = calculateHistogram(totalDurations);
    const durationHistData = {
      labels: durHist.labels,
      datasets: [
        {
          label: 'Frequency',
          data: durHist.counts,
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        }
      ]
    };

    // Cost histogram
    const costHist = calculateHistogram(totalCosts);
    const costHistData = {
      labels: costHist.labels,
      datasets: [
        {
          label: 'Frequency',
          data: costHist.counts,
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        }
      ]
    };

    // S-Curve for duration
    const sortedDurations = [...totalDurations].sort((a, b) => a - b);
    const cumulativeProbDur = sortedDurations.map((_, idx) => ((idx + 1) / validRuns));
    const sCurveScatterDurationData = {
      datasets: [
        {
          label: 'Cumulative Probability',
          data: sortedDurations.map((duration, idx) => ({ x: duration, y: cumulativeProbDur[idx] })),
          borderColor: 'rgba(255, 99, 132, 1)',
          backgroundColor: 'rgba(255, 99, 132, 0.5)',
          showLine: true,
          pointRadius: 0,
          tension: 0.1
        }
      ]
    };

    // S-Curve for cost
    const sortedCosts = [...totalCosts].sort((a, b) => a - b);
    const cumulativeProbCost = sortedCosts.map((_, idx) => ((idx + 1) / validRuns));
    const sCurveScatterCostData = {
      datasets: [
        {
          label: 'Cumulative Probability',
          data: sortedCosts.map((cost, idx) => ({ x: cost, y: cumulativeProbCost[idx] })),
          borderColor: 'rgba(153, 102, 255, 1)',
          backgroundColor: 'rgba(153, 102, 255, 0.5)',
          showLine: true,
          pointRadius: 0,
          tension: 0.1
        }
      ]
    };

    // Tornado chart for sensitivity (top 10 tasks by absolute correlation)
    const sensitivityWithNames = (analysis.durationSensitivity || []).map((corr, idx) => ({
      name: tasks[idx]?.name || `Task ${idx + 1}`,
      wbs: tasks[idx]?.wbs,
      corr: corr || 0
    })).filter(item => !isNaN(item.corr));

    sensitivityWithNames.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
    const topSens = sensitivityWithNames.slice(0, 10);
    topSens.sort((a, b) => a.corr - b.corr);
    const tornData = {
      labels: topSens.map(item => `${item.name}${item.wbs ? ` (${item.wbs})` : ''}`),
      datasets: [
        {
          label: 'Duration Sensitivity (Pearson Corr.)',
          data: topSens.map(item => item.corr),
          backgroundColor: topSens.map(item =>
            item.corr >= 0 ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)'
          ),
          borderColor: topSens.map(item =>
            item.corr >= 0 ? 'rgba(75, 192, 192, 1)' : 'rgba(255, 99, 132, 1)'
          ),
          borderWidth: 1
        }
      ]
    };

    return {
      durationHistogramData: durationHistData,
      costHistogramData: costHistData,
      sCurveDurationData: sCurveScatterDurationData,
      sCurveCostData: sCurveScatterCostData,
      tornadoData: tornData
    };
  }, [simulationRuns, analysis, tasks]);

  if (!simulationRuns || simulationRuns.length === 0 || !analysis || !durationHistogramData) return null;
  const validRuns = simulationRuns.length;

  // Dynamic confidence query: Compute the project percentile values based on the input confidence level.
  const totalDurations = simulationRuns.map(r => r.totalDuration);
  const totalCosts = simulationRuns.map(r => r.totalCost);
  const confidencePercentilesDuration = getPercentiles(totalDurations, [confidenceLevel]);
  const confidencePercentilesCost = getPercentiles(totalCosts, [confidenceLevel]);
  const projectDurationAtConfidence = confidencePercentilesDuration[confidenceLevel]
    ? confidencePercentilesDuration[confidenceLevel].toFixed(2)
    : "N/A";
  const projectCostAtConfidence = confidencePercentilesCost[confidenceLevel]
    ? confidencePercentilesCost[confidenceLevel].toFixed(2)
    : "N/A";

  return (
    <div className="mt-8 p-4 border rounded-lg bg-gray-50 shadow">
      <h3 className="text-2xl font-semibold mb-6">Simulation Results ({validRuns} Runs)</h3>
      
      <div className="mb-8 p-4 bg-white rounded-lg border shadow-sm">
        <h4 className="text-lg font-semibold mb-3">Project Summary</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            Mean Duration: <span className="font-medium">{analysis.meanDuration?.toFixed(2)} days</span> (StdDev: {analysis.stdDevDuration?.toFixed(2)})
          </div>
          <div>
            Mean Cost: <span className="font-medium">${analysis.meanCost?.toFixed(2)}</span> (StdDev: ${analysis.stdDevCost?.toFixed(2)})
          </div>
          <div>
            P{confidenceLevel} Duration: <span className="font-medium">{projectDurationAtConfidence} days</span>
          </div>
          <div>
            P{confidenceLevel} Cost: <span className="font-medium">${projectCostAtConfidence}</span>
          </div>
          <div>
            Project SSI (Dur CoV): <span className="font-medium">{analysis.scheduleSensitivityIndexProject?.toFixed(3)}</span>
          </div>
        </div>
        <p className="mt-4 text-sm">
          <strong>Confidence Query:</strong> At a {confidenceLevel}% confidence level, the project is estimated to finish within{" "}
          <strong className="text-blue-600">{projectDurationAtConfidence} days</strong> and cost less than{" "}
          <strong className="text-blue-600">${projectCostAtConfidence}</strong>.
        </p>
      </div>

      {/* Render the Probabilistic Gantt Chart */}
      <ProbabilisticGanttChart 
        tasks={tasks} 
        taskTimings={allTaskTimings} 
        percentiles={[
          Math.max(confidenceLevel - 5, 0), 
          confidenceLevel, 
          Math.min(confidenceLevel + 5, 100)
        ]}
      />


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="p-4 bg-white rounded-lg border shadow-sm">
          <h4 className="text-lg font-semibold mb-3 text-center">Total Duration Distribution</h4>
          <Bar data={durationHistogramData} options={{
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              x: { title: { display: true, text: 'Duration Range (days)' } },
              y: { title: { display: true, text: 'Frequency' }, beginAtZero: true }
            }
          }} />
        </div>
        <div className="p-4 bg-white rounded-lg border shadow-sm">
          <h4 className="text-lg font-semibold mb-3 text-center">Total Cost Distribution</h4>
          <Bar data={costHistogramData} options={{
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              x: { title: { display: true, text: 'Cost Range ($)' } },
              y: { title: { display: true, text: 'Frequency' }, beginAtZero: true }
            }
          }} />
        </div>
        <div className="p-4 bg-white rounded-lg border shadow-sm">
          <h4 className="text-lg font-semibold mb-3 text-center">Duration S-Curve</h4>
          <Line data={sCurveDurationData} options={{
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              x: { type: 'linear', title: { display: true, text: 'Total Project Duration (days)' } },
              y: { title: { display: true, text: 'Cumulative Probability' }, min: 0, max: 1, ticks: { callback: (value) => (value * 100).toFixed(0) + '%' } }
            }
          }} />
          <p className="mt-2 text-xs text-gray-600 italic">
            S-Curves visually represent the cumulative likelihood of completing your project by a given duration.
            Use this chart to identify the probability of meeting your project schedule targets.
          </p>
        </div>
        <div className="p-4 bg-white rounded-lg border shadow-sm">
          <h4 className="text-lg font-semibold mb-3 text-center">Cost S-Curve</h4>
          <Line data={sCurveCostData} options={{
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              x: { type: 'linear', title: { display: true, text: 'Total Project Cost ($)' } },
              y: { title: { display: true, text: 'Cumulative Probability' }, min: 0, max: 1, ticks: { callback: (value) => (value * 100).toFixed(0) + '%' } }
            }
          }} />
          <p className="mt-2 text-xs text-gray-600 italic">
            S-Curves visually represent the cumulative likelihood of completing your project by a given cost.
            Use this chart to identify the probability of meeting your project budget targets.
          </p>
        </div>
        <div className="lg:col-span-2 p-4 bg-white rounded-lg border shadow-sm">
          <h4 className="text-lg font-semibold mb-3 text-center">Duration Sensitivity (Top 10 Tasks)</h4>
          <Bar data={tornadoData} options={{
            indexAxis: 'y',
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              x: { title: { display: true, text: 'Correlation with Total Duration' } },
              y: { title: { display: true, text: 'Task (WBS)' } }
            }
          }} />
          <p className="mt-2 text-xs text-gray-600 italic">
            Sensitivity analysis identifies which tasks have the greatest influence on the overall project duration.
            Tasks higher on the chart are more critical—focusing on them can help reduce overall project risk.
          </p>
        </div>
      </div>

      <div className="mb-6 overflow-x-auto">
        <h4 className="text-lg font-semibold mb-3">Task Sensitivity & Criticality Metrics</h4>
        <table className="min-w-full border">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 text-xs font-medium text-left">WBS</th>
              <th className="px-4 py-2 text-xs font-medium text-left">Task</th>
              <th className="px-4 py-2 text-xs font-medium text-left">Duration Sensitivity</th>
              <th className="px-4 py-2 text-xs font-medium text-left">Cost Sensitivity</th>
              <th className="px-4 py-2 text-xs font-medium text-left">Criticality Index</th>
              <th className="px-4 py-2 text-xs font-medium text-left">Cruciality (CI*Sens)</th>
            </tr>
          </thead>

          <tbody className="bg-white divide-y">
            {tasks.map((task, idx) => (
              <tr key={task.id}>
                <td className="px-4 py-2 text-left">{task.wbs || '-'}</td>
                <td className="px-4 py-2 font-medium text-left">{task.name}</td>
                <td className="px-4 py-2 text-left">{analysis.durationSensitivity[idx]?.toFixed(3) || 'N/A'}</td>
                <td className="px-4 py-2 text-left">{analysis.costSensitivity[idx]?.toFixed(3) || 'N/A'}</td>
                <td className="px-4 py-2 text-left">{(analysis.criticalityIndex[idx] * 100)?.toFixed(1) || 'N/A'}%</td>
                <td className="px-4 py-2 text-left">{analysis.durationCruciality[idx]?.toFixed(3) || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-600 italic leading-relaxed">
          <strong>Duration Sensitivity</strong>: Measures correlation between task duration and project duration. <br />
          <strong>Cost Sensitivity</strong>: Measures correlation between task cost and project cost. <br />
          <strong>Criticality Index</strong>: Percentage of simulations in which the task was on the critical path (0 slack). <br />
          <strong>Cruciality</strong>: Product of Criticality Index and Duration Sensitivity. Highlights tasks that are both critical and influential.
        </p>

      </div>
    </div>
  );
}

export default SimulationResults;
