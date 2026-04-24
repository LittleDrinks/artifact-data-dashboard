import urllib.request
import json

# Try login with admin/admin123
req = urllib.request.Request(
    'http://127.0.0.1:8000/api/auth/login',
    data=json.dumps({'username': 'admin', 'password': 'admin123'}).encode('utf-8'),
    headers={'Content-Type': 'application/json'},
    method='POST'
)
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print('Login success:', data['user']['username'], 'role:', data['user']['role'])
        token = data['access_token']
        
        # Test me endpoint
        req2 = urllib.request.Request('http://127.0.0.1:8000/api/auth/me', headers={'Authorization': f'Bearer {token}'})
        with urllib.request.urlopen(req2) as resp2:
            print('Me:', json.loads(resp2.read().decode('utf-8'))['username'])
            
        # Test chat sessions
        req3 = urllib.request.Request('http://127.0.0.1:8000/api/chat/sessions?page=1&size=5', headers={'Authorization': f'Bearer {token}'})
        with urllib.request.urlopen(req3) as resp3:
            data3 = json.loads(resp3.read().decode('utf-8'))
            print('Chat sessions:', data3['total'])
except urllib.error.HTTPError as e:
    print('Login failed:', e.code, e.read().decode('utf-8'))
