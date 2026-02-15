import React, { useEffect } from 'react';
import * as d3 from 'd3';
import { getNodeColor } from '../utils/graph.utils';

const GraphRenderer = ({
  nodes, links, width, height, forceSettings, displaySettings,
  svgRef, simulationApi, interactionApi, onNodeClick, hasAutoFitRef, focusNodeIdRef
}) => {
  const { initZoom, createSimulation, stopSimulation } = simulationApi;
  const { pinnedNodeIdsRef, pinnedPositionsRef, handleNodeClickInternal, togglePin, applyPinnedStyles } = interactionApi;

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    d3.select(svgRef.current).selectAll('*').remove();
    const svg = d3.select(svgRef.current).attr('width', '100%').attr('height', height).attr('viewBox', [0, 0, width, height]);
    const g = svg.append('g');
    initZoom(svg, g);

    const simNodes = nodes.map(d => ({ ...d, x: width / 2, y: height / 2 }));
    const simLinks = links.map(d => ({ ...d }));
    const simulation = createSimulation(simNodes, simLinks, forceSettings);

    svg.append('defs').selectAll('marker').data(['arrow']).join('marker')
      .attr('id', 'arrow').attr('viewBox', '0 -5 10 10').attr('refX', 25).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#ccc');

    const link = g.append('g').selectAll('line').data(simLinks).join('line')
      .attr('stroke', '#ccc').attr('stroke-width', 2).attr('marker-end', 'url(#arrow)');

    const linkLabel = displaySettings.showLinkLabels ? g.append('g').selectAll('text').data(simLinks).join('text')
      .attr('class', 'link-label').attr('font-size', 10).attr('fill', '#666')
      .attr('text-anchor', 'middle').text(d => d.label) : null;

    const node = g.append('g').selectAll('circle').data(simNodes).join('circle')
      .attr('r', 20).attr('fill', d => getNodeColor(d.type))
      .attr('stroke', '#fff').attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('click', (event, d) => handleNodeClickInternal(event, d, onNodeClick))
      .on('mouseover', function() { d3.select(this).attr('stroke', '#000').attr('stroke-width', 3); })
      .on('mouseout', function(event, d) { d3.select(this).attr('stroke', '#fff').attr('stroke-width', 2); })
      .call(d3.drag().on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.1).restart();
        d.fx = d.x; d.fy = d.y;
      }).on('drag', (event, d) => {
        d.fx = event.x; d.fy = event.y;
      }).on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null; d.fy = null;
      }));

    const label = displaySettings.showNodeLabels ? g.append('g').selectAll('text').data(simNodes).join('text')
      .attr('class', 'node-label').attr('font-size', 12).attr('fill', '#333')
      .attr('text-anchor', 'middle').attr('dy', 35).text(d => d.label).style('pointer-events', 'none') : null;

    simulation.on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('cx', d => d.x).attr('cy', d => d.y);
      if (label) label.attr('x', d => d.x).attr('y', d => d.y);
      if (linkLabel) linkLabel.attr('x', d => (d.source.x + d.target.x) / 2).attr('y', d => (d.source.y + d.target.y) / 2);
    });

    return () => stopSimulation();
  }, [nodes, links, width, height, forceSettings, displaySettings, svgRef, initZoom, createSimulation, stopSimulation, handleNodeClickInternal, onNodeClick]);

  return null;
};

export default GraphRenderer;
