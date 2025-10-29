# ==============================
# 获取深圳博物馆的藏品数据
# 数据来源：https://www.shenzhenmuseum.com/wwk/collection

import requests
from bs4 import BeautifulSoup
import pprint

# 这个 url 是页面动态显示文物时访问的 api
# 注意到 api 中存在一个 pageSize 的参数，将其改为 65536 后就可以一次性获取所有文物的 id
# 然后通过 id 访问每个文物的详细信息，具体 api 见下面的代码
url = "https://www.shenzhenmuseum.com/api/v1/wwk/collection/list?category=&specificYear=&has3dUrl=&pageNum=1&pageSize=65536&tagId=&keyword="

response = requests.get(url)
artifact_list = [(item['id'], item['name']) for item in response.json()["rows"]]





# ===============================
# 获取单个文物的详细信息

import json
import time

MAX_RETRIES = 3
RETRY_DELAY = 10  # seconds

def get_data(id):
    for attempt in range(MAX_RETRIES):
        try:
            item_base_url = "https://www.shenzhenmuseum.com/api/v1/wwk/collection/"
            response = requests.get(item_base_url + str(id))
            artifact_data = response.json()
            return {artifact_data["data"]["id"]: artifact_data["data"]}
        except Exception as e:
            print(f"Error fetching data for ID {id}: {e}")
            time.sleep(RETRY_DELAY)
            if attempt == MAX_RETRIES - 1:
                print(f"error when processing {i + 1} : ID {id}")
                return None
            else:
                print("retry!")


with open("artifact.json", "w", encoding="utf-8") as f:

    data = dict()
    
    for i, item in enumerate(artifact_list):

        id, name = item
        print(f"processing {i+1}/{len(artifact_list)}: ID {id} name {name}")

        artifact_data = get_data(id)

        if artifact_data == None:
            exit()

        data.update(artifact_data)

        time.sleep(1)
        
    json.dump(data, f, ensure_ascii=False, indent=4)