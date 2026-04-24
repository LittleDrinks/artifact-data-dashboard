from neo4j import GraphDatabase

try:
    driver = GraphDatabase.driver('bolt://localhost:7687', auth=('neo4j', 'password'))
    with driver.session() as session:
        result = session.run('MATCH (n) RETURN count(n) AS cnt')
        print('Neo4j nodes:', result.single()['cnt'])
        result2 = session.run("MATCH (n) WHERE n.source = 'rule' RETURN count(n) AS cnt")
        print('Neo4j rule nodes:', result2.single()['cnt'])
    driver.close()
except Exception as e:
    print('Neo4j error:', e)
