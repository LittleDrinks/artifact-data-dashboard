from app.database import init_db
from sqlalchemy import create_engine, text

init_db()
engine = create_engine('sqlite:///data/app.db')
with engine.connect() as conn:
    result = conn.execute(text('SELECT COUNT(*) FROM artifacts'))
    print('Artifacts:', result.scalar())
    result2 = conn.execute(text('SELECT COUNT(*) FROM users'))
    print('Users:', result2.scalar())
    result3 = conn.execute(text('SELECT COUNT(*) FROM chat_sessions'))
    print('Chat sessions:', result3.scalar())
    result4 = conn.execute(text('SELECT COUNT(*) FROM chat_messages'))
    print('Chat messages:', result4.scalar())
