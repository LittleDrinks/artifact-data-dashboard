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
    // 为不同类型的节点创建唯一性约束
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (a:Artifact) REQUIRE a.name IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (c:Category) REQUIRE c.name IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (e:Era) REQUIRE e.name IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (l:Location) REQUIRE l.name IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (m:Material) REQUIRE m.name IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (a:Author) REQUIRE a.name IS UNIQUE');
    
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
    // 创建文物节点
    await session.run(`
      CREATE 
        (a1:Artifact {name: '四羊方尊', description: '商代青铜礼器，因器身四面各有一只羊而得名，具有精美的铸造工艺。', id: 1}),
        (a2:Artifact {name: '唐三彩骆驼俑', description: '盛唐时期彩陶俑，展现了丝绸之路上的商贸往来场景。', id: 2}),
        (a3:Artifact {name: '玉琮', description: '良渚文化玉礼器，象征天地沟通的权力与神性。', id: 3}),
        (a4:Artifact {name: '清明上河图', description: '北宋风俗画，由张择端所绘，描绘了北宋都城汴京的繁华景象。', id: 4}),
        (a5:Artifact {name: '青铜鸮尊', description: '西周早期青铜礼器，呈鸮鸟形，用于盛酒。', id: 5}),
        (a6:Artifact {name: '汉白玉佛像', description: '唐代雕塑，造型优美，体现了盛唐时期佛教艺术的特点。', id: 6}),
        (a7:Artifact {name: '战国帛画', description: '战国时期丝绢彩绘，绘有人物、龙凤等图案，是早期中国绘画的珍贵实物。', id: 7}),
        (a8:Artifact {name: '越王勾践剑', description: '春秋晚期越国青铜宝剑，锋利无比，历经两千余年仍可断发，代表了中国古代青铜冶炼工艺的最高水平。', id: 8}),
        (a9:Artifact {name: '明宣德炉', description: '明宣德年间铜质香炉，炉体呈圆形，口沿外撇，腹部稍鼓，三足，铜质细腻，包浆均匀。', id: 9}),
        (a10:Artifact {name: '青花缠枝莲纹梅瓶', description: '元代青花瓷器，瓶体修长，颈部短小，肩部圆缓，绘有缠枝莲纹，青花发色纯正。', id: 10})
    `);
    
    // 创建类别节点
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
    
    // 创建年代节点
    await session.run(`
      CREATE 
        (e1:Era {name: '新石器时代', start_year: -8000, end_year: -2000}),
        (e2:Era {name: '商代', start_year: -1600, end_year: -1046}),
        (e3:Era {name: '西周', start_year: -1046, end_year: -771}),
        (e4:Era {name: '春秋', start_year: -770, end_year: -476}),
        (e5:Era {name: '战国', start_year: -475, end_year: -221}),
        (e6:Era {name: '秦汉', start_year: -221, end_year: 220}),
        (e7:Era {name: '三国两晋', start_year: 220, end_year: 420}),
        (e8:Era {name: '南北朝', start_year: 420, end_year: 589}),
        (e9:Era {name: '隋唐', start_year: 589, end_year: 907}),
        (e10:Era {name: '宋元', start_year: 960, end_year: 1368}),
        (e11:Era {name: '明清', start_year: 1368, end_year: 1912})
    `);
    
    // 创建地点节点
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
    
    // 创建作者节点
    await session.run(`
      CREATE 
        (a1:Author {name: '张择端', era: '北宋', description: '北宋画家，擅长绘制风俗画，代表作《清明上河图》。'}),
        (a2:Author {name: '未知作者', description: '历史中未留下确切作者信息的文物作品。'})
    `);
    
    // 创建材质节点
    await session.run(`
      CREATE 
        (m1:Material {name: '青铜', description: '铜与锡、铅等金属的合金，古代用于制作礼器、兵器等。'}),
        (m2:Material {name: '陶土', description: '黏土经焙烧后形成的材料，用于制作陶器。'}),
        (m3:Material {name: '玉石', description: '硬玉或软玉等玉石材料，用于制作玉器。'}),
        (m4:Material {name: '丝绢', description: '丝织品，古代用作绘画材料。'}),
        (m5:Material {name: '紙', description: '由植物纤维制成的薄片，用作书写和绘画的材料。'}),
        (m6:Material {name: '汉白玉', description: '一种洁白细腻的大理石，多用于雕刻。'}),
        (m7:Material {name: '紫铜', description: '纯度较高的铜，呈紫红色，常用于制作生活用品和工艺品。'}),
        (m8:Material {name: '瓷土', description: '含高岭土的粘土，经高温焙烧可制成瓷器。'})
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
    // 文物-类别关系
    await session.run(`
      MATCH (a:Artifact), (c:Category)
      WHERE a.name = '四羊方尊' AND c.name = '青铜器'
      OR a.name = '唐三彩骆驼俑' AND c.name = '陶器'
      OR a.name = '玉琮' AND c.name = '玉器'
      OR a.name = '清明上河图' AND c.name = '书画'
      OR a.name = '青铜鸮尊' AND c.name = '青铜器'
      OR a.name = '汉白玉佛像' AND c.name = '雕塑'
      OR a.name = '战国帛画' AND c.name = '书画'
      OR a.name = '越王勾践剑' AND c.name = '兵器'
      OR a.name = '明宣德炉' AND c.name = '铜器'
      OR a.name = '青花缠枝莲纹梅瓶' AND c.name = '瓷器'
      CREATE (a)-[:BELONGS_TO]->(c)
    `);
    
    // 文物-年代关系
    await session.run(`
      MATCH (a:Artifact), (e:Era)
      WHERE a.name = '四羊方尊' AND e.name = '商代'
      OR a.name = '唐三彩骆驼俑' AND e.name = '隋唐'
      OR a.name = '玉琮' AND e.name = '新石器时代'
      OR a.name = '清明上河图' AND e.name = '宋元'
      OR a.name = '青铜鸮尊' AND e.name = '西周'
      OR a.name = '汉白玉佛像' AND e.name = '隋唐'
      OR a.name = '战国帛画' AND e.name = '战国'
      OR a.name = '越王勾践剑' AND e.name = '春秋'
      OR a.name = '明宣德炉' AND e.name = '明清'
      OR a.name = '青花缠枝莲纹梅瓶' AND e.name = '宋元'
      CREATE (a)-[:DATED_AS]->(e)
    `);
    
    // 文物-出土地点关系
    await session.run(`
      MATCH (a:Artifact), (l:Location)
      WHERE a.name = '四羊方尊' AND l.name = '湖南'
      OR a.name = '唐三彩骆驼俑' AND l.name = '西安'
      OR a.name = '玉琮' AND l.name = '浙江'
      OR a.name = '清明上河图' AND l.name = '河南'
      OR a.name = '青铜鸮尊' AND l.name = '陕西'
      OR a.name = '汉白玉佛像' AND l.name = '洛阳'
      OR a.name = '战国帛画' AND l.name = '湖南'
      OR a.name = '越王勾践剑' AND l.name = '湖北'
      OR a.name = '明宣德炉' AND l.name = '北京'
      OR a.name = '青花缠枝莲纹梅瓶' AND l.name = '江西'
      CREATE (a)-[:DISCOVERED_IN]->(l)
    `);
    
    // 文物-材质关系
    await session.run(`
      MATCH (a:Artifact), (m:Material)
      WHERE a.name = '四羊方尊' AND m.name = '青铜'
      OR a.name = '唐三彩骆驼俑' AND m.name = '陶土'
      OR a.name = '玉琮' AND m.name = '玉石'
      OR a.name = '清明上河图' AND m.name = '丝绢'
      OR a.name = '青铜鸮尊' AND m.name = '青铜'
      OR a.name = '汉白玉佛像' AND m.name = '汉白玉'
      OR a.name = '战国帛画' AND m.name = '丝绢'
      OR a.name = '越王勾践剑' AND m.name = '青铜'
      OR a.name = '明宣德炉' AND m.name = '紫铜'
      OR a.name = '青花缠枝莲纹梅瓶' AND m.name = '瓷土'
      CREATE (a)-[:MADE_OF]->(m)
    `);
    
    // 文物-作者关系
    await session.run(`
      MATCH (a:Artifact), (au:Author)
      WHERE a.name = '清明上河图' AND au.name = '张择端'
      CREATE (a)-[:CREATED_BY]->(au)
    `);
    
    // 为其他文物添加未知作者
    await session.run(`
      MATCH (a:Artifact), (au:Author)
      WHERE au.name = '未知作者'
      AND NOT (a)-[:CREATED_BY]->()
      CREATE (a)-[:CREATED_BY]->(au)
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
