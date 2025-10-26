// Neo4j知识图谱初始化脚本
const neo4j = require('neo4j-driver');
require('dotenv').config();

// 连接Neo4j数据库
const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD || 'password'
  )
);

// 清空现有的图谱数据
async function clearDatabase() {
  const session = driver.session();
  try {
    await session.run('MATCH (n) DETACH DELETE n');
    console.log('数据库已清空');
  } catch (error) {
    console.error('清空数据库时出错:', error);
  } finally {
    await session.close();
  }
}

// 创建约束和索引
async function createConstraints() {
  const session = driver.session();
  try {
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (a:Artifact) REQUIRE a.id IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (c:Category) REQUIRE c.name IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (e:Era) REQUIRE e.name IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (l:Location) REQUIRE l.name IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (m:Material) REQUIRE m.name IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (d:Dimension) REQUIRE d.label IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (dg:DamageType) REQUIRE dg.name IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (rm:RestorationMethod) REQUIRE rm.name IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (rf:ReinforcementMethod) REQUIRE rf.name IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (it:InspectionTechnique) REQUIRE it.name IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (pm:ProtectiveMaterial) REQUIRE pm.name IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (im:InspectionMetric) REQUIRE im.name IS UNIQUE');

    console.log('约束和索引已创建');
  } catch (error) {
    console.error('创建约束和索引时出错:', error);
  } finally {
    await session.close();
  }
}

// 创建节点
async function createNodes() {
  const session = driver.session();
  try {
    await session.run(`
      CREATE
        (a1:Artifact {id: 'artifact-1', name: '四羊方尊', description: '商代青铜礼器，因器身四面各有一只羊而得名，具有精美的铸造工艺。', tags: ['礼器', '青铜'], isCataloged: true, isDigitized: true, needsRepair: false}),
        (a2:Artifact {id: 'artifact-2', name: '唐三彩骆驼俑', description: '盛唐时期彩陶俑，展现了丝绸之路上的商贸往来场景。', tags: ['陶俑', '陪葬品'], isCataloged: true, isDigitized: false, needsRepair: false}),
        (a3:Artifact {id: 'artifact-3', name: '玉琮', description: '良渚文化玉礼器，象征天地沟通的权力与神性。', tags: ['玉器', '礼器'], isCataloged: true, isDigitized: true, needsRepair: false}),
        (a4:Artifact {id: 'artifact-4', name: '清明上河图', description: '北宋风俗画，由张择端所绘，描绘了北宋都城汴京的繁华景象。', tags: ['书画', '风俗画'], isCataloged: true, isDigitized: true, needsRepair: false}),
        (a5:Artifact {id: 'artifact-5', name: '青铜鸮尊', description: '西周早期青铜礼器，呈鸮鸟形，用于盛酒。', tags: ['青铜器', '酒器'], isCataloged: true, isDigitized: false, needsRepair: false}),
        (a6:Artifact {id: 'artifact-6', name: '汉白玉佛像', description: '唐代雕塑，造型优美，体现了盛唐时期佛教艺术的特点。', tags: ['雕塑', '佛像'], isCataloged: true, isDigitized: false, needsRepair: true}),
        (a7:Artifact {id: 'artifact-7', name: '战国帛画', description: '战国时期丝绢彩绘，绘有人物、龙凤等图案，是早期中国绘画的珍贵实物。', tags: ['帛画', '丝绢'], isCataloged: true, isDigitized: true, needsRepair: true}),
        (a8:Artifact {id: 'artifact-8', name: '越王勾践剑', description: '春秋晚期越国青铜宝剑，锋利无比，历经两千余年仍可断发，代表了中国古代青铜冶炼工艺的最高水平。', tags: ['兵器', '青铜'], isCataloged: true, isDigitized: true, needsRepair: false}),
        (a9:Artifact {id: 'artifact-9', name: '明宣德炉', description: '明宣德年间铜质香炉，炉体呈圆形，口沿外撇，腹部稍鼓，三足，铜质细腻，包浆均匀。', tags: ['香炉', '铜器'], isCataloged: true, isDigitized: true, needsRepair: false}),
        (a10:Artifact {id: 'artifact-10', name: '青花缠枝莲纹梅瓶', description: '元代青花瓷器，瓶体修长，颈部短小，肩部圆缓，绘有缠枝莲纹，青花发色纯正。', tags: ['瓷器', '青花'], isCataloged: true, isDigitized: true, needsRepair: false})
    `);

    await session.run(`
      CREATE
        (c1:Category {name: '青铜器', description: '以青铜为主要材料制作的器物，多用于礼仪、祭祀等场合。'}),
        (c2:Category {name: '陶器', description: '以黏土为原料经成型、干燥、焙烧而成的器物。'}),
        (c3:Category {name: '玉器', description: '用玉石雕刻而成的器物，在中国传统文化中具有特殊意义。'}),
        (c4:Category {name: '书画', description: '包括绘画和书法作品，是中国传统艺术的重要组成部分。'}),
        (c5:Category {name: '雕塑', description: '立体造型艺术，包括石雕、木雕、泥塑等多种形式。'}),
        (c6:Category {name: '兵器', description: '古代作战或仪式用的武器装备。'}),
        (c7:Category {name: '铜器', description: '以紫铜为主要材料制作的器物，多为生活用品和礼器。'}),
        (c8:Category {name: '瓷器', description: '以瓷土为原料，经高温焙烧而成的器物，具有坚硬、细腻的特点。'})
    `);

    await session.run(`
      CREATE
        (e1:Era {name: '新石器时代', startYear: -8000, endYear: -2000}),
        (e2:Era {name: '商代', startYear: -1600, endYear: -1046}),
        (e3:Era {name: '西周', startYear: -1046, endYear: -771}),
        (e4:Era {name: '春秋', startYear: -770, endYear: -476}),
        (e5:Era {name: '战国', startYear: -475, endYear: -221}),
        (e6:Era {name: '秦汉', startYear: -221, endYear: 220}),
        (e7:Era {name: '三国两晋', startYear: 220, endYear: 420}),
        (e8:Era {name: '南北朝', startYear: 420, endYear: 589}),
        (e9:Era {name: '隋唐', startYear: 589, endYear: 907}),
        (e10:Era {name: '宋元', startYear: 960, endYear: 1368}),
        (e11:Era {name: '明清', startYear: 1368, endYear: 1912})
    `);

    await session.run(`
      CREATE
        (l1:Location {name: '湖南', region: '中南', longitude: 112.983, latitude: 28.119}),
        (l2:Location {name: '西安', region: '西北', longitude: 108.946, latitude: 34.347}),
        (l3:Location {name: '浙江', region: '华东', longitude: 120.153, latitude: 30.287}),
        (l4:Location {name: '河南', region: '华中', longitude: 113.665, latitude: 34.758}),
        (l5:Location {name: '陕西', region: '西北', longitude: 108.954, latitude: 34.265}),
        (l6:Location {name: '洛阳', region: '华中', longitude: 112.434, latitude: 34.663}),
        (l7:Location {name: '湖北', region: '华中', longitude: 114.298, latitude: 30.584}),
        (l8:Location {name: '北京', region: '华北', longitude: 116.407, latitude: 39.904}),
        (l9:Location {name: '江西', region: '华东', longitude: 115.892, latitude: 28.676})
    `);

    await session.run(`
      CREATE
        (m1:Material {name: '青铜', description: '铜与锡、铅等金属的合金，古代用于制作礼器、兵器等。'}),
        (m2:Material {name: '陶土', description: '黏土经焙烧后形成的材料，用于制作陶器。'}),
        (m3:Material {name: '玉石', description: '硬玉或软玉等玉石材料，用于制作玉器。'}),
        (m4:Material {name: '丝绢', description: '丝织品，古代用作绘画材料。'}),
        (m5:Material {name: '纸张', description: '由植物纤维制成的薄片，用作书写和绘画的材料。'}),
        (m6:Material {name: '汉白玉', description: '一种洁白细腻的大理石，多用于雕刻。'}),
        (m7:Material {name: '紫铜', description: '纯度较高的铜，呈紫红色，常用于制作生活用品和工艺品。'}),
        (m8:Material {name: '瓷土', description: '含高岭土的粘土，经高温焙烧可制成瓷器。'})
    `);

    await session.run(`
      CREATE
        (d1:Dimension {label: '四羊方尊-高度', value: 52.4, unit: 'cm'}),
        (d2:Dimension {label: '唐三彩骆驼俑-高度', value: 45.1, unit: 'cm'}),
        (d3:Dimension {label: '玉琮-直径', value: 12.5, unit: 'cm'}),
        (d4:Dimension {label: '清明上河图-长度', value: 528.7, unit: 'cm'}),
        (d5:Dimension {label: '越王勾践剑-长度', value: 55.7, unit: 'cm'}),
        (d6:Dimension {label: '青花缠枝莲纹梅瓶-高度', value: 36.2, unit: 'cm'})
    `);

    await session.run(`
      CREATE
        (dg1:DamageType {name: '氧化腐蚀', severity: '高', description: '表面出现氧化锈蚀，需及时处理以避免扩大。'}),
        (dg2:DamageType {name: '结构裂纹', severity: '中', description: '材料结构出现细小裂纹，需要加固与修复。'}),
        (dg3:DamageType {name: '色彩褪色', severity: '低', description: '表面颜料或釉色逐渐褪色，可考虑环境控制。'})
    `);

    await session.run(`
      CREATE
        (rm1:RestorationMethod {name: '机械除锈', description: '使用微型工具精细去除表面锈蚀。'}),
        (rm2:RestorationMethod {name: '结构加固修复', description: '通过内部支撑或外部包覆增强结构稳定性。'}),
        (rm3:RestorationMethod {name: '色彩稳定处理', description: '针对褪色区域进行色彩稳定和加固处理。'})
    `);

    await session.run(`
      CREATE
        (rf1:ReinforcementMethod {name: '内部框架加固', description: '为易碎文物添加轻量框架以分散应力。'}),
        (rf2:ReinforcementMethod {name: '外部支撑加固', description: '通过外部支撑结构提升文物稳定性。'})
    `);

    await session.run(`
      CREATE
        (it1:InspectionTechnique {name: 'X射线成像', description: '用于检测内部结构和隐藏裂纹。'}),
        (it2:InspectionTechnique {name: '红外反射成像', description: '用于分析表面颜料层和下层绘制。'}),
        (it3:InspectionTechnique {name: '三维激光扫描', description: '提供高精度几何模型与尺寸数据。'})
    `);

    await session.run(`
      CREATE
        (pm1:ProtectiveMaterial {name: '微晶蜡', description: '用于金属文物表面防护的涂层。'}),
        (pm2:ProtectiveMaterial {name: '可逆性树脂', description: '用于脆弱材质的加固与填补，具可逆性。'})
    `);

    await session.run(`
      CREATE
        (im1:InspectionMetric {name: '表面腐蚀率', unit: '%', idealRange: '0-5'}),
        (im2:InspectionMetric {name: '结构稳定指数', unit: '指数', idealRange: '0.8-1.0'}),
        (im3:InspectionMetric {name: '色彩保持度', unit: '%', idealRange: '85-100'})
    `);

    console.log('节点已创建');
  } catch (error) {
    console.error('创建节点时出错:', error);
  } finally {
    await session.close();
  }
}

// 创建关系
async function createRelationships() {
  const session = driver.session();
  try {
    await session.run(`
      UNWIND [
        {artifactId: 'artifact-1', category: '青铜器'},
        {artifactId: 'artifact-2', category: '陶器'},
        {artifactId: 'artifact-3', category: '玉器'},
        {artifactId: 'artifact-4', category: '书画'},
        {artifactId: 'artifact-5', category: '青铜器'},
        {artifactId: 'artifact-6', category: '雕塑'},
        {artifactId: 'artifact-7', category: '书画'},
        {artifactId: 'artifact-8', category: '兵器'},
        {artifactId: 'artifact-9', category: '铜器'},
        {artifactId: 'artifact-10', category: '瓷器'}
      ] AS row
      MATCH (a:Artifact {id: row.artifactId})
      MATCH (c:Category {name: row.category})
      MERGE (a)-[:HAS_CATEGORY]->(c)
    `);

    await session.run(`
      UNWIND [
        {artifactId: 'artifact-1', era: '商代'},
        {artifactId: 'artifact-2', era: '隋唐'},
        {artifactId: 'artifact-3', era: '新石器时代'},
        {artifactId: 'artifact-4', era: '宋元'},
        {artifactId: 'artifact-5', era: '西周'},
        {artifactId: 'artifact-6', era: '隋唐'},
        {artifactId: 'artifact-7', era: '战国'},
        {artifactId: 'artifact-8', era: '春秋'},
        {artifactId: 'artifact-9', era: '明清'},
        {artifactId: 'artifact-10', era: '宋元'}
      ] AS row
      MATCH (a:Artifact {id: row.artifactId})
      MATCH (e:Era {name: row.era})
      MERGE (a)-[:BELONGS_TO_ERA]->(e)
    `);

    await session.run(`
      UNWIND [
        {artifactId: 'artifact-1', location: '湖南'},
        {artifactId: 'artifact-2', location: '西安'},
        {artifactId: 'artifact-3', location: '浙江'},
        {artifactId: 'artifact-4', location: '河南'},
        {artifactId: 'artifact-5', location: '陕西'},
        {artifactId: 'artifact-6', location: '洛阳'},
        {artifactId: 'artifact-7', location: '湖南'},
        {artifactId: 'artifact-8', location: '湖北'},
        {artifactId: 'artifact-9', location: '北京'},
        {artifactId: 'artifact-10', location: '江西'}
      ] AS row
      MATCH (a:Artifact {id: row.artifactId})
      MATCH (l:Location {name: row.location})
      MERGE (a)-[:STORED_AT]->(l)
    `);

    await session.run(`
      UNWIND [
        {artifactId: 'artifact-1', material: '青铜'},
        {artifactId: 'artifact-2', material: '陶土'},
        {artifactId: 'artifact-3', material: '玉石'},
        {artifactId: 'artifact-4', material: '丝绢'},
        {artifactId: 'artifact-5', material: '青铜'},
        {artifactId: 'artifact-6', material: '汉白玉'},
        {artifactId: 'artifact-7', material: '丝绢'},
        {artifactId: 'artifact-8', material: '青铜'},
        {artifactId: 'artifact-9', material: '紫铜'},
        {artifactId: 'artifact-10', material: '瓷土'}
      ] AS row
      MATCH (a:Artifact {id: row.artifactId})
      MATCH (m:Material {name: row.material})
      MERGE (a)-[:MADE_OF]->(m)
    `);

    await session.run(`
      UNWIND [
        {artifactId: 'artifact-1', dimension: '四羊方尊-高度'},
        {artifactId: 'artifact-2', dimension: '唐三彩骆驼俑-高度'},
        {artifactId: 'artifact-3', dimension: '玉琮-直径'},
        {artifactId: 'artifact-4', dimension: '清明上河图-长度'},
        {artifactId: 'artifact-8', dimension: '越王勾践剑-长度'},
        {artifactId: 'artifact-10', dimension: '青花缠枝莲纹梅瓶-高度'}
      ] AS row
      MATCH (a:Artifact {id: row.artifactId})
      MATCH (d:Dimension {label: row.dimension})
      MERGE (a)-[:HAS_DIMENSION]->(d)
    `);

    await session.run(`
      UNWIND [
        {artifactId: 'artifact-2', damage: '色彩褪色'},
        {artifactId: 'artifact-6', damage: '结构裂纹'},
        {artifactId: 'artifact-7', damage: '色彩褪色'},
        {artifactId: 'artifact-8', damage: '氧化腐蚀'}
      ] AS row
      MATCH (a:Artifact {id: row.artifactId})
      MATCH (dg:DamageType {name: row.damage})
      MERGE (a)-[:HAS_DAMAGE]->(dg)
    `);

    await session.run(`
      UNWIND [
        {artifactId: 'artifact-2', methods: ['色彩稳定处理']},
        {artifactId: 'artifact-6', methods: ['结构加固修复']},
        {artifactId: 'artifact-7', methods: ['色彩稳定处理']},
        {artifactId: 'artifact-8', methods: ['机械除锈']}
      ] AS row
      MATCH (a:Artifact {id: row.artifactId})
      UNWIND row.methods AS methodName
      MATCH (rm:RestorationMethod {name: methodName})
      MERGE (a)-[:USES_RESTORATION]->(rm)
    `);

    await session.run(`
      UNWIND [
        {artifactId: 'artifact-6', reinforcements: ['内部框架加固']},
        {artifactId: 'artifact-7', reinforcements: ['外部支撑加固']}
      ] AS row
      MATCH (a:Artifact {id: row.artifactId})
      UNWIND row.reinforcements AS reinforcementName
      MATCH (rf:ReinforcementMethod {name: reinforcementName})
      MERGE (a)-[:USES_REINFORCEMENT]->(rf)
    `);

    await session.run(`
      UNWIND [
        {artifactId: 'artifact-1', techniques: ['X射线成像']},
        {artifactId: 'artifact-4', techniques: ['红外反射成像']},
        {artifactId: 'artifact-6', techniques: ['三维激光扫描']},
        {artifactId: 'artifact-8', techniques: ['X射线成像']},
        {artifactId: 'artifact-10', techniques: ['三维激光扫描']}
      ] AS row
      MATCH (a:Artifact {id: row.artifactId})
      UNWIND row.techniques AS techniqueName
      MATCH (tech:InspectionTechnique {name: techniqueName})
      MERGE (a)-[:INSPECTED_BY]->(tech)
    `);

    await session.run(`
      UNWIND [
        {artifactId: 'artifact-1', metrics: ['表面腐蚀率']},
        {artifactId: 'artifact-6', metrics: ['结构稳定指数']},
        {artifactId: 'artifact-7', metrics: ['色彩保持度']},
        {artifactId: 'artifact-8', metrics: ['表面腐蚀率']},
        {artifactId: 'artifact-10', metrics: ['色彩保持度']}
      ] AS row
      MATCH (a:Artifact {id: row.artifactId})
      UNWIND row.metrics AS metricName
      MATCH (metric:InspectionMetric {name: metricName})
      MERGE (a)-[:MEASURED_BY]->(metric)
    `);

    await session.run(`
      UNWIND [
        {artifactId: 'artifact-1', materials: ['微晶蜡']},
        {artifactId: 'artifact-6', materials: ['可逆性树脂']},
        {artifactId: 'artifact-8', materials: ['微晶蜡']},
        {artifactId: 'artifact-10', materials: ['可逆性树脂']}
      ] AS row
      MATCH (a:Artifact {id: row.artifactId})
      UNWIND row.materials AS materialName
      MATCH (pm:ProtectiveMaterial {name: materialName})
      MERGE (a)-[:PROTECTED_WITH]->(pm)
    `);

    console.log('关系已创建');
  } catch (error) {
    console.error('创建关系时出错:', error);
  } finally {
    await session.close();
  }
}

// 运行初始化过程
async function initializeGraph() {
  try {
    await clearDatabase();
    await createConstraints();
    await createNodes();
    await createRelationships();
    console.log('知识图谱初始化完成');
  } catch (error) {
    console.error('知识图谱初始化失败:', error);
  } finally {
    await driver.close();
  }
}

initializeGraph();
