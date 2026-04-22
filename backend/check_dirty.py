import sqlite3
conn = sqlite3.connect('data/app.db')
cursor = conn.cursor()

# Check for duplicate names
cursor.execute('SELECT name, COUNT(*) as cnt FROM artifacts GROUP BY name HAVING cnt > 1 ORDER BY cnt DESC LIMIT 10')
duplicates = cursor.fetchall()
print('Duplicate names:')
for row in duplicates:
    print(row)

# Check for empty/null era
cursor.execute("SELECT COUNT(*) FROM artifacts WHERE era IS NULL OR era = '' OR era = '-'")
print('\nEmpty era:', cursor.fetchone()[0])

# Check for empty/null location
cursor.execute("SELECT COUNT(*) FROM artifacts WHERE location IS NULL OR location = '' OR location = '-'")
print('Empty location:', cursor.fetchone()[0])

# Check for empty/null category
cursor.execute("SELECT COUNT(*) FROM artifacts WHERE category IS NULL OR category = ''")
print('Empty category:', cursor.fetchone()[0])

# Check for Wikipedia maintenance categories
cursor.execute("SELECT name, category FROM artifacts WHERE category LIKE '%维基%' OR category LIKE '%条目%' OR category LIKE '%错误%' OR category LIKE '%链接%' LIMIT 10")
print('\nWikipedia maintenance categories:')
for row in cursor.fetchall():
    print(row)

# Check for location with years in parentheses
cursor.execute("SELECT name, location FROM artifacts WHERE location LIKE '%（%年%）%' OR location LIKE '%(%年%)%' LIMIT 10")
print('\nLocations with dates:')
for row in cursor.fetchall():
    print(row)

conn.close()
