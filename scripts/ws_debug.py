import uuid
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.app.api.chat import chat_router
from backend.database import SessionLocal
from backend.models.user import User
from backend.services.auth_service import AuthService

app = FastAPI()
app.include_router(chat_router)
client = TestClient(app)
auth = AuthService()

owner_id = str(uuid.uuid4())
member_id = str(uuid.uuid4())

db = SessionLocal()
for uid, name in [(owner_id, 'A'), (member_id, 'B')]:
    db.add(User(id=uid, email=f'{uid[:8]}@x.com', firebase_uid=f'{uid[:8]}', name=name, level=1, xp=0, gems=0))
db.commit()
db.close()

atok = auth.mint_token_pair(owner_id).access_token
btok = auth.mint_token_pair(member_id).access_token
res = client.post('/api/chat/rooms', json={'name': 'ws-debug'}, cookies={'access_token': atok})
room_id = res.json()['room']['id']
invite = res.json()['invite_token']
client.post('/api/chat/rooms/join', json={'invite_token': invite}, cookies={'access_token': btok})

with client.websocket_connect(f'/ws/chat/{room_id}?auth={atok}') as wa:
    print('wa1', wa.receive_json())
    with client.websocket_connect(f'/ws/chat/{room_id}?auth={btok}') as wb:
        print('wb1', wb.receive_json())
        print('wa2', wa.receive_json())
        wa.send_json({'type': 'message:new', 'text': 'ping'})
        print('sent')
        print('wb2', wb.receive_json())
        print('wa3', wa.receive_json())
