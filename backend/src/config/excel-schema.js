const GRAPH_NODE_EXPORTS = [
  {
    sheet: 'Artifacts',
    headers: ['artifact_id', 'name', 'description', 'tags', 'isCataloged', 'isDigitized', 'needsRepair'],
    query: `
      MATCH (a:Artifact)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             a.name AS name,
             a.description AS description,
             a.tags AS tags,
             a.isCataloged AS isCataloged,
             a.isDigitized AS isDigitized,
             a.needsRepair AS needsRepair
      ORDER BY artifact_id
    `
  },
  {
    sheet: 'Categories',
    headers: ['name', 'description'],
    query: `
      MATCH (c:Category)
      RETURN c.name AS name,
             c.description AS description
      ORDER BY name
    `
  },
  {
    sheet: 'Eras',
    headers: ['name', 'startYear', 'endYear'],
    query: `
      MATCH (e:Era)
      RETURN e.name AS name,
             e.startYear AS startYear,
             e.endYear AS endYear
      ORDER BY startYear, name
    `
  },
  {
    sheet: 'Locations',
    headers: ['name', 'region', 'longitude', 'latitude'],
    query: `
      MATCH (l:Location)
      RETURN l.name AS name,
             l.region AS region,
             l.longitude AS longitude,
             l.latitude AS latitude
      ORDER BY name
    `
  },
  {
    sheet: 'Materials',
    headers: ['name', 'description'],
    query: `
      MATCH (m:Material)
      RETURN m.name AS name,
             m.description AS description
      ORDER BY name
    `
  },
  {
    sheet: 'Dimensions',
    headers: ['label', 'value', 'unit'],
    query: `
      MATCH (d:Dimension)
      RETURN d.label AS label,
             d.value AS value,
             d.unit AS unit
      ORDER BY label
    `
  },
  {
    sheet: 'DamageTypes',
    headers: ['name', 'severity', 'description'],
    query: `
      MATCH (dg:DamageType)
      RETURN dg.name AS name,
             dg.severity AS severity,
             dg.description AS description
      ORDER BY name
    `
  },
  {
    sheet: 'RestorationMethods',
    headers: ['name', 'description'],
    query: `
      MATCH (rm:RestorationMethod)
      RETURN rm.name AS name,
             rm.description AS description
      ORDER BY name
    `
  },
  {
    sheet: 'ReinforcementMethods',
    headers: ['name', 'description'],
    query: `
      MATCH (rf:ReinforcementMethod)
      RETURN rf.name AS name,
             rf.description AS description
      ORDER BY name
    `
  },
  {
    sheet: 'InspectionTechniques',
    headers: ['name', 'description'],
    query: `
      MATCH (it:InspectionTechnique)
      RETURN it.name AS name,
             it.description AS description
      ORDER BY name
    `
  },
  {
    sheet: 'ProtectiveMaterials',
    headers: ['name', 'description'],
    query: `
      MATCH (pm:ProtectiveMaterial)
      RETURN pm.name AS name,
             pm.description AS description
      ORDER BY name
    `
  },
  {
    sheet: 'InspectionMetrics',
    headers: ['name', 'unit', 'idealRange'],
    query: `
      MATCH (im:InspectionMetric)
      RETURN im.name AS name,
             im.unit AS unit,
             im.idealRange AS idealRange
      ORDER BY name
    `
  }
];

const GRAPH_REL_EXPORTS = [
  {
    sheet: 'REL_HAS_CATEGORY',
    headers: ['artifact_id', 'category_name'],
    query: `
      MATCH (a:Artifact)-[:HAS_CATEGORY]->(c:Category)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             c.name AS category_name
      ORDER BY artifact_id, category_name
    `
  },
  {
    sheet: 'REL_BELONGS_TO_ERA',
    headers: ['artifact_id', 'era_name'],
    query: `
      MATCH (a:Artifact)-[:BELONGS_TO_ERA]->(e:Era)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             e.name AS era_name
      ORDER BY artifact_id, era_name
    `
  },
  {
    sheet: 'REL_STORED_AT',
    headers: ['artifact_id', 'location_name'],
    query: `
      MATCH (a:Artifact)-[:STORED_AT]->(l:Location)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             l.name AS location_name
      ORDER BY artifact_id, location_name
    `
  },
  {
    sheet: 'REL_MADE_OF',
    headers: ['artifact_id', 'material_name'],
    query: `
      MATCH (a:Artifact)-[:MADE_OF]->(m:Material)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             m.name AS material_name
      ORDER BY artifact_id, material_name
    `
  },
  {
    sheet: 'REL_HAS_DIMENSION',
    headers: ['artifact_id', 'dimension_label'],
    query: `
      MATCH (a:Artifact)-[:HAS_DIMENSION]->(d:Dimension)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             d.label AS dimension_label
      ORDER BY artifact_id, dimension_label
    `
  },
  {
    sheet: 'REL_HAS_DAMAGE',
    headers: ['artifact_id', 'damage_name'],
    query: `
      MATCH (a:Artifact)-[:HAS_DAMAGE]->(dg:DamageType)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             dg.name AS damage_name
      ORDER BY artifact_id, damage_name
    `
  },
  {
    sheet: 'REL_USES_RESTORATION',
    headers: ['artifact_id', 'restoration_name'],
    query: `
      MATCH (a:Artifact)-[:USES_RESTORATION]->(rm:RestorationMethod)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             rm.name AS restoration_name
      ORDER BY artifact_id, restoration_name
    `
  },
  {
    sheet: 'REL_USES_REINFORCEMENT',
    headers: ['artifact_id', 'reinforcement_name'],
    query: `
      MATCH (a:Artifact)-[:USES_REINFORCEMENT]->(rf:ReinforcementMethod)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             rf.name AS reinforcement_name
      ORDER BY artifact_id, reinforcement_name
    `
  },
  {
    sheet: 'REL_INSPECTED_BY',
    headers: ['artifact_id', 'technique_name'],
    query: `
      MATCH (a:Artifact)-[:INSPECTED_BY]->(it:InspectionTechnique)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             it.name AS technique_name
      ORDER BY artifact_id, technique_name
    `
  },
  {
    sheet: 'REL_PROTECTED_WITH',
    headers: ['artifact_id', 'protective_material_name'],
    query: `
      MATCH (a:Artifact)-[:PROTECTED_WITH]->(pm:ProtectiveMaterial)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             pm.name AS protective_material_name
      ORDER BY artifact_id, protective_material_name
    `
  },
  {
    sheet: 'REL_MEASURED_BY',
    headers: ['artifact_id', 'metric_name'],
    query: `
      MATCH (a:Artifact)-[:MEASURED_BY]->(im:InspectionMetric)
      RETURN coalesce(a.id, toString(id(a))) AS artifact_id,
             im.name AS metric_name
      ORDER BY artifact_id, metric_name
    `
  }
];

const EXCEL_SCHEMA = {
  nodes: GRAPH_NODE_EXPORTS.map(({ sheet, headers }) => ({ sheet, headers })),
  relations: GRAPH_REL_EXPORTS.map(({ sheet, headers }) => ({ sheet, headers }))
};

const EXCEL_SHEETS_IN_ORDER = [...EXCEL_SCHEMA.nodes, ...EXCEL_SCHEMA.relations];

module.exports = {
  GRAPH_NODE_EXPORTS,
  GRAPH_REL_EXPORTS,
  EXCEL_SCHEMA,
  EXCEL_SHEETS_IN_ORDER
};
