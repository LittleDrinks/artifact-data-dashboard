-- MySQL数据库初始化脚本

-- 全局字符集设置
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;
SET character_set_connection = utf8mb4;

-- 确保数据库使用utf8mb4
CREATE DATABASE IF NOT EXISTS artifact_dashboard
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE artifact_dashboard;

-- 创建users表
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  organization VARCHAR(150) NULL,
  title VARCHAR(100) NULL,
  bio TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建artifacts表
CREATE TABLE IF NOT EXISTS artifacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  era VARCHAR(50),
  location VARCHAR(100),
  image_url VARCHAR(255),
  tags TEXT,
  is_cataloged BOOLEAN DEFAULT FALSE,
  is_digitized BOOLEAN DEFAULT FALSE,
  needs_repair BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FULLTEXT INDEX idx_artifact_fulltext (name, description, tags)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建logs表
CREATE TABLE IF NOT EXISTS logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  action VARCHAR(50) NOT NULL,
  target_id INT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  details TEXT,
  INDEX idx_logs_user_timestamp (user_id, timestamp),
  INDEX idx_logs_action_timestamp (action, timestamp),
  INDEX idx_logs_action_target (action, target_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建attachments表（附件元数据）
CREATE TABLE IF NOT EXISTS attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  owner_type VARCHAR(50) NULL,
  owner_id INT NULL,
  uploaded_by INT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_name VARCHAR(255) NOT NULL,
  `hash` VARCHAR(64) NULL,
  meta JSON NULL,
  status ENUM('processing','ok','failed') NOT NULL DEFAULT 'ok',
  thumbnail_storage_name VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_attachments_owner (owner_type, owner_id),
  INDEX idx_attachments_hash (`hash`),
  INDEX idx_attachments_status (status),
  INDEX idx_attachments_uploaded_by (uploaded_by),
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建attachment_refs表（附件引用关系）
CREATE TABLE IF NOT EXISTS attachment_refs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  attachment_id INT NOT NULL,
  owner_type VARCHAR(50) NOT NULL,
  owner_id BIGINT UNSIGNED NOT NULL,
  relation_type VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_attachment_refs_owner (owner_type, owner_id),
  INDEX idx_attachment_refs_attachment (attachment_id),
  CONSTRAINT fk_attachment_refs_attachment
    FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 插入管理员账户
INSERT INTO users (username, email, password_hash, role) VALUES
('admin', 'admin@example.com', '$2a$10$myBxkYDPKMFPrwZG9psVUupG3hoX7W.TYp0moN.Ez0/4f573TW1sy', 'admin'); -- 密码: admin123

-- 插入示例文物数据
INSERT INTO artifacts (name, description, category, era, location, image_url, tags, is_cataloged, is_digitized, needs_repair) VALUES
('四羊方尊', '商代晚期青铜礼器，出土于湖南宁乡，因器身四面各有一只羊而得名，是中国商代青铜文化的代表作之一。', '青铜器', '商代', '湖南宁乡', 'https://pic.baike.soso.com/ugc/baikepic2/0/20200722144851-1624292484.jpg/800', '青铜,方尊,礼器,兽面纹', TRUE, TRUE, FALSE),
('司母戊鼎', '商代晚期青铜器，出土于河南安阳，是中国现存最大的商代青铜鼎，也被称为"后母戊鼎"，重达832.84千克。', '青铜器', '商代', '河南安阳', 'https://pic.baike.soso.com/ugc/baikepic2/0/20160928161539-626487870.jpg/800', '青铜,鼎,礼器,最大', TRUE, TRUE, FALSE),
('毛公鼎', '西周晚期青铜器，铭文497字，记述了周厉王赐爵赏给毛公的场景，是研究西周政治、礼制的重要资料。', '青铜器', '西周', '陕西岐山', 'https://pic.baike.soso.com/ugc/baikepic2/0/20160928161540-1023927129.jpg/800', '青铜,鼎,铭文,礼器', TRUE, TRUE, FALSE),
('三彩骆驼', '唐代三彩陶器，形象生动，彩釉艳丽，反映了唐代丝绸之路文化交流的盛况。', '陶器', '唐代', '陕西西安', 'https://pic.baike.soso.com/ugc/baikepic2/0/20160919201044-960279990.jpg/800', '三彩,陶器,骆驼,丝绸之路', TRUE, TRUE, FALSE),
('清明上河图', '北宋张择端创作的绢本设色画卷，长528.7厘米，描绘了北宋都城汴京的繁华景象，反映了当时的经济、文化、社会风貌。', '书画', '北宋', '河南开封', 'https://pic.baike.soso.com/ugc/baikepic2/0/20160919145839-574252399.jpg/800', '绘画,风俗画,城市生活', TRUE, TRUE, FALSE),
('和氏璧', '春秋战国时期的传奇玉璧，相传为卞和献给楚文王的美玉，后成为传国玉玺的原料。', '玉器', '战国', '湖北荆州', '', '玉璧,传国玉玺,传说', TRUE, FALSE, TRUE),
('曾侯乙编钟', '战国早期曾国高级贵族墓出土的青铜编钟，由65件钟组成，音律精确，铭文丰富，是中国古代乐器的杰出代表。', '青铜器', '战国', '湖北随州', 'https://pic.baike.soso.com/ugc/baikepic2/0/ori-20220629154405-1056114104_jpg_800_0_0.jpg/800', '乐器,青铜,编钟', TRUE, TRUE, FALSE),
('兵马俑', '秦始皇陵出土的陶质彩绘武士俑，共有8000多个真人大小的陶俑，再现了秦代军队的雄壮场面。', '陶器', '秦代', '陕西西安', 'https://pic.baike.soso.com/ugc/baikepic2/0/20200514124542-1671564116.jpg/800', '陶俑,军阵,彩绘,世界文化遗产', TRUE, TRUE, FALSE),
('莫高窟壁画', '敦煌莫高窟保存的壁画，创作时间跨越近千年，总面积达45000平方米，是世界上现存规模最大、内容最丰富的佛教艺术宝库。', '壁画', '多朝代', '甘肃敦煌', 'https://pic.baike.soso.com/ugc/baikepic2/0/20160919114853-390135760.jpg/800', '佛教艺术,壁画,石窟,世界文化遗产', TRUE, TRUE, FALSE),
('富春山居图', '元代黄公望创作的山水画，原作分为《剩山图》和《无用师卷》两部分，分别藏于浙江博物馆和台北故宫博物院。', '书画', '元代', '浙江杭州', 'https://pic.baike.soso.com/ugc/baikepic2/0/20220212112437-1242962124_jpg_814_402_57271.jpg/800', '山水画,水墨,文人画', TRUE, TRUE, FALSE),
('玉琮', '良渚文化玉礼器，象征天地沟通的权力与神性。', '玉器', '新石器时代', '浙江', '/images/artifacts/cong.jpg', '礼器,玉器,良渚', TRUE, TRUE, TRUE),
('清明上河图', '北宋风俗画，由张择端所绘，描绘了北宋都城汴京的繁华景象。', '书画', '北宋', '河南', '/images/artifacts/qingming-riverside.jpg', '名画,风俗画,张择端', TRUE, TRUE, FALSE),
('青铜鸮尊', '西周早期青铜礼器，呈鸮鸟形，用于盛酒。', '青铜器', '西周', '陕西', '/images/artifacts/bronze-owl-zun.jpg', '青铜,礼器,鸟形', TRUE, FALSE, TRUE),
('汉白玉佛像', '唐代雕塑，造型优美，体现了盛唐时期佛教艺术的特点。', '雕塑', '唐代', '洛阳', '/images/artifacts/white-marble-buddha.jpg', '佛像,汉白玉,雕塑', TRUE, TRUE, FALSE),
('战国帛画', '战国时期丝绢彩绘，绘有人物、龙凤等图案，是早期中国绘画的珍贵实物。', '书画', '战国', '湖南', '/images/artifacts/warring-states-silk-painting.jpg', '帛画,丝绢,古画', TRUE, TRUE, TRUE),
('越王勾践剑', '春秋晚期越国青铜宝剑，锋利无比，历经两千余年仍可断发，代表了中国古代青铜冶炼工艺的最高水平。', '兵器', '春秋', '湖北', '/images/artifacts/goujian-sword.jpg', '宝剑,越王,青铜', TRUE, TRUE, FALSE),
('明宣德炉', '明宣德年间铜质香炉，炉体呈圆形，口沿外撇，腹部稍鼓，三足，铜质细腻，包浆均匀。', '铜器', '明代', '北京', '/images/artifacts/xuande-censer.jpg', '香炉,宣德,铜器', TRUE, FALSE, FALSE),
('青花缠枝莲纹梅瓶', '元代青花瓷器，瓶体修长，颈部短小，肩部圆缓，绘有缠枝莲纹，青花发色纯正。', '瓷器', '元代', '江西', '/images/artifacts/blue-white-meiping.jpg', '青花,梅瓶,元青花', TRUE, TRUE, FALSE);
