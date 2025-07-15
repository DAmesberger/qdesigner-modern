<script lang="ts">
  import { 
    SvelteFlow, 
    Background, 
    Controls,
    MiniMap,
    Panel,
    type Node, 
    type Edge,
    type NodeTypes,
    type EdgeTypes,
    BackgroundVariant,
    Position
  } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  
  import { designerStore } from '$lib/features/designer/stores/designerStore';
  import type { FlowControl, Page, Block, Variable } from '$lib/shared/types/questionnaire';
  import theme from '$lib/theme';
  
  // Custom node components
  import PageNode from './nodes/PageNode.svelte';
  import BlockNode from './nodes/BlockNode.svelte';
  import QuestionNode from './nodes/QuestionNode.svelte';
  import BranchNode from './nodes/BranchNode.svelte';
  import LoopNode from './nodes/LoopNode.svelte';
  import TerminateNode from './nodes/TerminateNode.svelte';
  import VariableNode from './nodes/VariableNode.svelte';
  
  // Custom edge component
  import ConditionalEdge from './edges/ConditionalEdge.svelte';
  
  interface Props {
    flowControls?: FlowControl[];
    onUpdate: (flowControls: FlowControl[]) => void;
  }
  
  const { flowControls = [], onUpdate }: Props = $props();
  
  // Node and edge types
  const nodeTypes: NodeTypes = {
    page: PageNode,
    block: BlockNode,
    question: QuestionNode,
    branch: BranchNode,
    loop: LoopNode,
    terminate: TerminateNode,
    variable: VariableNode
  };
  
  const edgeTypes: EdgeTypes = {
    conditional: ConditionalEdge
  };
  
  // State
  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  let selectedFlow: FlowControl | null = null;
  
  // Subscribe to designer store
  const { questionnaire } = $designerStore;
  
  // Convert questionnaire structure to flow nodes
  function generateFlowNodes(): Node[] {
    const flowNodes: Node[] = [];
    let yOffset = 0;
    
    // Start node
    flowNodes.push({
      id: 'start',
      type: 'input',
      data: { label: 'Start' },
      position: { x: 400, y: 0 },
      sourcePosition: Position.Bottom
    });
    
    // Add pages
    questionnaire.pages.forEach((page, pageIndex) => {
      yOffset += 150;
      
      // Page node
      flowNodes.push({
        id: `page-${page.id}`,
        type: 'page',
        data: { 
          page,
          label: page.name || `Page ${pageIndex + 1}`
        },
        position: { x: 400, y: yOffset },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top
      });
      
      // Add blocks if they exist
      if (page.blocks && page.blocks.length > 0) {
        page.blocks.forEach((block, blockIndex) => {
          yOffset += 100;
          
          flowNodes.push({
            id: `block-${block.id}`,
            type: 'block',
            data: {
              block,
              label: block.name || `Block ${blockIndex + 1}`,
              type: block.type
            },
            position: { x: 400 + (blockIndex % 2 === 1 ? 200 : -200), y: yOffset },
            parentId: `page-${page.id}`,
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top
          });
          
          // Add questions in block
          if (block.questions.length > 0) {
            block.questions.forEach((questionId, qIndex) => {
              const question = questionnaire.questions.find(q => q.id === questionId);
              if (question) {
                yOffset += 60;
                
                flowNodes.push({
                  id: `question-${question.id}`,
                  type: 'question',
                  data: {
                    question,
                    label: question.name || `Q${qIndex + 1}`
                  },
                  position: { x: 400 + (blockIndex % 2 === 1 ? 200 : -200), y: yOffset },
                  parentId: `block-${block.id}`,
                  sourcePosition: Position.Bottom,
                  targetPosition: Position.Top
                });
              }
            });
          }
        });
      }
    });
    
    // Add flow control nodes
    flowControls.forEach((flow, flowIndex) => {
      yOffset += 120;
      
      let nodeType = 'branch';
      if (flow.type === 'loop') nodeType = 'loop';
      if (flow.type === 'terminate') nodeType = 'terminate';
      
      flowNodes.push({
        id: `flow-${flow.id}`,
        type: nodeType,
        data: {
          flow,
          label: `${flow.type.charAt(0).toUpperCase() + flow.type.slice(1)}`
        },
        position: { x: 600, y: yOffset },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top
      });
    });
    
    // Add relevant variables
    const usedVariables = extractVariablesFromFlows(flowControls);
    usedVariables.forEach((varName, varIndex) => {
      const variable = questionnaire.variables.find(v => v.name === varName);
      if (variable) {
        flowNodes.push({
          id: `var-${variable.id}`,
          type: 'variable',
          data: {
            variable,
            label: variable.name
          },
          position: { x: 100 + (varIndex * 150), y: 50 },
          sourcePosition: Position.Bottom
        });
      }
    });
    
    // End node
    yOffset += 150;
    flowNodes.push({
      id: 'end',
      type: 'output',
      data: { label: 'End' },
      position: { x: 400, y: yOffset },
      targetPosition: Position.Top
    });
    
    return flowNodes;
  }
  
  // Generate edges based on flow controls
  function generateFlowEdges(nodes: Node[]): Edge[] {
    const flowEdges: Edge[] = [];
    
    // Connect start to first page
    if (questionnaire.pages.length > 0) {
      flowEdges.push({
        id: 'start-page1',
        source: 'start',
        target: `page-${questionnaire.pages[0].id}`,
        type: 'smoothstep'
      });
    }
    
    // Connect pages sequentially
    for (let i = 0; i < questionnaire.pages.length - 1; i++) {
      const currentPage = questionnaire.pages[i];
      const nextPage = questionnaire.pages[i + 1];
      
      flowEdges.push({
        id: `page-${currentPage.id}-${nextPage.id}`,
        source: `page-${currentPage.id}`,
        target: `page-${nextPage.id}`,
        type: 'smoothstep'
      });
    }
    
    // Connect blocks within pages
    questionnaire.pages.forEach(page => {
      if (page.blocks && page.blocks.length > 0) {
        // Connect page to first block
        flowEdges.push({
          id: `page-${page.id}-block-${page.blocks[0].id}`,
          source: `page-${page.id}`,
          target: `block-${page.blocks[0].id}`,
          type: 'smoothstep',
          animated: true
        });
        
        // Connect blocks to each other
        for (let i = 0; i < page.blocks.length - 1; i++) {
          flowEdges.push({
            id: `block-${page.blocks[i].id}-${page.blocks[i + 1].id}`,
            source: `block-${page.blocks[i].id}`,
            target: `block-${page.blocks[i + 1].id}`,
            type: 'smoothstep'
          });
        }
      }
    });
    
    // Add flow control edges
    flowControls.forEach(flow => {
      if (flow.type === 'skip' || flow.type === 'branch') {
        if (flow.target) {
          // Find source based on condition
          const sourceId = findSourceForFlow(flow);
          if (sourceId) {
            flowEdges.push({
              id: `flow-${flow.id}`,
              source: sourceId,
              target: flow.target.startsWith('page') ? `page-${flow.target}` : `question-${flow.target}`,
              type: 'conditional',
              data: {
                condition: flow.condition,
                flow
              },
              animated: true,
              label: flow.condition
            });
          }
        }
      }
    });
    
    // Connect last page to end
    if (questionnaire.pages.length > 0) {
      const lastPage = questionnaire.pages[questionnaire.pages.length - 1];
      flowEdges.push({
        id: `page-${lastPage.id}-end`,
        source: `page-${lastPage.id}`,
        target: 'end',
        type: 'smoothstep'
      });
    }
    
    return flowEdges;
  }
  
  // Extract variable names from flow conditions
  function extractVariablesFromFlows(flows: FlowControl[]): Set<string> {
    const variables = new Set<string>();
    
    flows.forEach(flow => {
      if (flow.condition) {
        // Simple regex to extract variable names
        const varMatches = flow.condition.match(/\b[a-zA-Z_]\w*\b/g);
        if (varMatches) {
          varMatches.forEach(match => {
            // Check if it's actually a variable in our questionnaire
            if (questionnaire.variables.some(v => v.name === match)) {
              variables.add(match);
            }
          });
        }
      }
    });
    
    return variables;
  }
  
  // Find source node for a flow control
  function findSourceForFlow(flow: FlowControl): string | null {
    // This is simplified - in reality you'd analyze the condition
    // to determine which question/page it relates to
    if (flow.condition && flow.condition.includes('question')) {
      // Extract question reference from condition
      const match = flow.condition.match(/question\.(\w+)/);
      if (match) {
        return `question-${match[1]}`;
      }
    }
    
    // Default to last added node
    if (nodes.length > 0) {
      return nodes[nodes.length - 2].id;
    }
    
    return null;
  }
  
  // Handle node/edge changes
  function handleNodesChange(event: CustomEvent) {
    // Update positions or handle other changes
  }
  
  function handleEdgesChange(event: CustomEvent) {
    // Update edge connections
  }
  
  function handleConnect(event: CustomEvent) {
    const { source, target, sourceHandle, targetHandle } = event.detail;
    
    // Create new flow control based on connection
    const newFlow: FlowControl = {
      id: `flow-${Date.now()}`,
      type: 'branch',
      condition: 'true', // Default condition
      target: target.replace('page-', '').replace('question-', '')
    };
    
    onUpdate([...flowControls, newFlow]);
  }
  
  // Initialize nodes and edges
  $effect(() => {
    nodes = generateFlowNodes();
    edges = generateFlowEdges(nodes);
  });
</script>

<div class="flow-control-editor h-full {theme.components.container.base}">
  <SvelteFlow
    bind:nodes
    bind:edges
    {nodeTypes}
    {edgeTypes}
    fitView
    minZoom={0.1}
    maxZoom={2}
    defaultEdgeOptions={{ 
      type: 'smoothstep',
      animated: false 
    }}
    on:nodeschange={handleNodesChange}
    on:edgeschange={handleEdgesChange}
    on:connect={handleConnect}
  >
    <Background variant={BackgroundVariant.Dots} />
    <MiniMap />
    <Controls />
    
    <Panel position="top-left" class="{theme.components.container.card} p-2">
      <div class="flex items-center gap-2">
        <button
          class="{theme.components.button.variants.outline} {theme.components.button.sizes.xs} rounded"
          onclick={() => {
            // Auto-layout functionality
          }}
        >
          Auto Layout
        </button>
        <button
          class="{theme.components.button.variants.outline} {theme.components.button.sizes.xs} rounded"
          onclick={() => {
            // Export as image
          }}
        >
          Export
        </button>
      </div>
    </Panel>
    
    <Panel position="bottom-left" class="{theme.components.container.card} p-2">
      <div class="{theme.typography.caption}">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-3 h-3 bg-blue-500 rounded-full"></div>
          <span>Pages & Blocks</span>
        </div>
        <div class="flex items-center gap-2 mb-1">
          <div class="w-3 h-3 bg-green-500 rounded-full"></div>
          <span>Variables</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 bg-orange-500 rounded-full"></div>
          <span>Flow Controls</span>
        </div>
      </div>
    </Panel>
  </SvelteFlow>
</div>

<style>
  :global(.flow-control-editor .svelte-flow) {
    background: var(--bg-surface);
  }
  
  :global(.flow-control-editor .svelte-flow__node) {
    font-size: 0.875rem;
  }
  
  :global(.flow-control-editor .svelte-flow__edge-label) {
    font-size: 0.75rem;
    background: white;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid #e5e7eb;
  }
</style>