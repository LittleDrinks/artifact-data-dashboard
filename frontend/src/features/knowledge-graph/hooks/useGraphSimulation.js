import { useRef, useCallback } from 'react';
import * as d3 from 'd3';
import {
  DEFAULT_FORCE_SETTINGS,
  ZOOM_CONFIG
} from '../utils/graph.constants';

export const useGraphSimulation = ({ width = 1000, height = 600 }) => {
  const simulationRef = useRef(null);
  const zoomRef = useRef(null);
  const svgSelectionRef = useRef(null);
  const gSelectionRef = useRef(null);

  const initZoom = useCallback((svg, g) => {
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .wheelDelta((event) => {
        const modeScale = event.deltaMode === 1 ? 16 : (event.deltaMode === 2 ? 800 : 1);
        return (-event.deltaY * modeScale) / 1500;
      })
      .on('zoom', (event) => g.attr('transform', event.transform));

    svg.call(zoom);
    zoomRef.current = zoom;
    svgSelectionRef.current = svg;
    gSelectionRef.current = g;
    return zoom;
  }, []);

  const createSimulation = useCallback((nodes, links, forceSettings) => {
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id)
        .distance(forceSettings.linkDistance)
        .strength(forceSettings.linkStrength))
      .force('charge', d3.forceManyBody()
        .strength(forceSettings.chargeStrength)
        .distanceMax(forceSettings.chargeDistanceMax))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(forceSettings.centerStrength))
      .force('collision', d3.forceCollide().radius(forceSettings.collisionRadius))
      .force('x', d3.forceX(width / 2).strength(forceSettings.xStrength))
      .force('y', d3.forceY(height / 2).strength(forceSettings.yStrength))
      .alphaDecay(forceSettings.alphaDecay)
      .velocityDecay(forceSettings.velocityDecay);

    simulationRef.current = simulation;
    return simulation;
  }, [width, height]);

  const fitToView = useCallback(() => {
    const svg = svgSelectionRef.current;
    const zoom = zoomRef.current;
    const g = gSelectionRef.current;
    if (!svg || !zoom || !g) return;

    const gNode = g.node();
    if (!gNode) return;

    const bounds = gNode.getBBox();
    const fullWidth = svg.node()?.clientWidth || width;
    if (!bounds.width || !bounds.height) return;

    const midX = bounds.x + bounds.width / 2;
    const midY = bounds.y + bounds.height / 2;
    const scale = 0.8 / Math.max(bounds.width / fullWidth, bounds.height / height);
    const translate = [fullWidth / 2 - scale * midX, height / 2 - scale * midY];

    svg.transition().duration(500)
      .call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
  }, [width, height]);

  const handleZoomIn = useCallback(() => {
    const svg = svgSelectionRef.current;
    const zoom = zoomRef.current;
    if (svg && zoom) svg.transition().duration(120).call(zoom.scaleBy, 1.15);
  }, []);

  const handleZoomOut = useCallback(() => {
    const svg = svgSelectionRef.current;
    const zoom = zoomRef.current;
    if (svg && zoom) svg.transition().duration(120).call(zoom.scaleBy, 1 / 1.15);
  }, []);

  const handleResetZoom = useCallback(() => {
    const svg = svgSelectionRef.current;
    const zoom = zoomRef.current;
    if (svg && zoom) svg.transition().duration(160).call(zoom.transform, d3.zoomIdentity);
  }, []);

  const stopSimulation = useCallback(() => {
    if (simulationRef.current) simulationRef.current.stop();
  }, []);

  return {
    simulationRef,
    zoomRef,
    svgSelectionRef,
    gSelectionRef,
    initZoom,
    createSimulation,
    fitToView,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
    stopSimulation
  };
};
