from neo4j import GraphDatabase
try:
    d = GraphDatabase.driver('bolt://localhost:7687', auth=('neo4j','password'))
    s = d.session()
    r = s.run('MATCH (n) RETURN count(n) AS cnt')
    print('Neo4j nodes:', r.single()['cnt'])
    r = s.run("MATCH (n) WHERE n.source='rule' RETURN count(n) AS cnt")
    print('Base layer:', r.single()['cnt'])
    d.close()
except Exception as e:
    print('Neo4j error:', e)
