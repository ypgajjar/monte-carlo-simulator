// src/ProbabilisticGanttChart.js
import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { getPercentiles } from './helpers'; // Ensure this helper is defined

function ProbabilisticGanttChart({ tasks, taskTimings, percentiles }) {
  // If the percentiles prop is not provided, use the fallback values.
  if (!percentiles) {
    percentiles = [10, 50, 90];
  }

  const { ganttChartJsData } = useMemo(() => {
    // If there are no tasks or no timing data, return null.
    if (!taskTimings || Object.keys(taskTimings).length === 0 || tasks.length === 0) {
      return { ganttChartJsData: null };
    }
    // pData will contain percentile calculations for each task.
    const pData = {};
    tasks.forEach(task => {
      if (taskTimings[task.id]) {
        pData[task.id] = {
          start: getPercentiles(taskTimings[task.id].starts, percentiles),
          finish: getPercentiles(taskTimings[task.id].finishes, percentiles)
        };
      }
    });
    
    // Build labels for the tasks (e.g., "Task Name (WBS)")
    const labels = tasks.map(task => `${task.name}${task.wbs ? ` (${task.wbs})` : ''}`);
    // Determine the lower and upper percentiles from the array.
    const pLow = Math.min(...percentiles);
    const pHigh = Math.max(...percentiles);
    
    // Create two datasets:
    // 1. A dataset representing the offset from the project start (using the lower percentile).
    // 2. A dataset representing the task duration (difference between finish at pHigh and start at pLow).
    const datasets = [
      {
        label: `Start (Before P${pLow})`,
        data: tasks.map(task => pData[task.id]?.start[pLow] ?? 0),
        backgroundColor: 'rgba(0, 0, 0, 0)', // Transparent
        borderColor: 'rgba(0, 0, 0, 0)',
        barPercentage: 0.6,
        categoryPercentage: 0.8,
      },
      {
        label: `Duration Range (P${pLow}-P${pHigh})`,
        data: tasks.map(task => {
          const start = pData[task.id]?.start[pLow] ?? 0;
          const finish = pData[task.id]?.finish[pHigh] ?? 0;
          return Math.max(0.1, finish - start);
        }),
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
        barPercentage: 0.6,
        categoryPercentage: 0.8,
      },
    ];
    
    return { ganttChartJsData: { labels, datasets } };
  }, [tasks, taskTimings, percentiles]);

  if (!ganttChartJsData) return null;

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
            if (!taskId) return 'No data available';
            // Retrieve percentile values for the task
            const taskPData = taskTimings[taskId];
            if (!taskPData) return 'No percentile data';
            const pValues = percentiles
              .map(p => `P${p}: ${getPercentiles(taskPData.starts, percentiles)[p]?.toFixed(1) || '0'} - ${getPercentiles(taskPData.finishes, percentiles)[p]?.toFixed(1) || '0'}`)
              .join(' | ');
            return context.datasetIndex === 1 ? `Duration Range | ${pValues}` : '';
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

  // Set container height based on number of tasks (with a minimum height)
  const containerHeight = Math.max(200, tasks.length * 35 + 50);

  return (
    <div className="mb-8 p-4 border rounded-lg bg-gray-50 shadow" style={{ height: `${containerHeight}px` }}>
      <h3 className="text-xl font-semibold mb-4">
        Probabilistic Gantt Chart (P{Math.min(...percentiles)}-P{Math.max(...percentiles)} Range)
      </h3>
      <Bar data={ganttChartJsData} options={options} />
    </div>
  );
}

export default ProbabilisticGanttChart;
