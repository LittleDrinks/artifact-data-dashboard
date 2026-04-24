import urllib.request
import json

# Test artifacts API
req = urllib.request.Request('http://127.0.0.1:8000/api/artifacts?page=1&size=1')
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    print('Artifacts API status:', resp.status)
    print('First item name:', data['items'][0]['name'])
    print('Total:', data['total'])

# Test health
req2 = urllib.request.Request('http://127.0.0.1:8000/api/health')
with urllib.request.urlopen(req2) as resp:
    print('Health:', resp.read().decode('utf-8'))

# Test graph
req3 = urllib.request.Request('http://127.0.0.1:8000/api/graph/full?limit=5')
with urllib.request.urlopen(req3) as resp:
    data3 = json.loads(resp.read().decode('utf-8'))
    print('Graph nodes:', len(data3['nodes']))
    print('Graph links:', len(data3['links']))
