// src/NetworkDiagram.jsx
import React, { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  MiniMap,
  Controls,
  Background
} from 'reactflow';
import 'reactflow/dist/style.css';

function NetworkDiagram({ tasks }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // onInit callback to auto-fit the view with a specified padding
  const onInit = useCallback((reactFlowInstance) => {
    reactFlowInstance.fitView({ padding: 0.3 });
  }, []);

  useEffect(() => {
    // Build nodes from tasks
    const newNodes = tasks.map((task, index) => ({
      id: task.id,
      data: { label: `${task.name}${task.wbs ? ` (${task.wbs})` : ''}` },
      position: { x: (index % 5) * 200, y: Math.floor(index / 5) * 120 },
      style: {
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: '4px',
        padding: '5px 10px',
        fontSize: '10px',
        minWidth: '100px',
        textAlign: 'center'
      }
    }));

    // Build edges between tasks based on dependencies
    const newEdges = [];
    tasks.forEach(task => {
      if (task.dependencies && task.dependencies.length > 0) {
        task.dependencies.forEach(dep => {
          if (
            dep.predecessorId &&
            dep.predecessorId !== 'START' &&
            tasks.some(t => t.id === dep.predecessorId)
          ) {
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
  }, [tasks, setNodes, setEdges]);

  if (tasks.length === 0) return null;

  return (
    <div className="mb-8 p-4 border rounded-lg bg-gray-50" style={{ height: 400 }}>
      <h3 className="text-xl font-semibold mb-4">Task Network Diagram</h3>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={onInit}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          nodesDraggable
          nodesConnectable={false}
          attributionPosition="bottom-right"
        >
          <MiniMap nodeStrokeWidth={3} zoomable pannable />
          <Controls />
          <Background color="#eee" gap={16} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}

export default NetworkDiagram;
