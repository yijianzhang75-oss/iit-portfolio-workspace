CREATE TABLE user_project_favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX user_project_favorites_project_idx
ON user_project_favorites(project_id);

UPDATE projects SET grade = 'S' WHERE grade IN ('S级', 'S级项目', 'S 类', 'S类');
UPDATE projects SET grade = 'A' WHERE grade IN ('A级', 'A级项目', 'A 类', 'A类');
UPDATE projects SET grade = 'B' WHERE grade IN ('B级', 'B级项目', 'B 类', 'B类');
UPDATE projects SET grade = 'C' WHERE grade IN ('C级', 'C级项目', 'C 类', 'C类');
UPDATE projects SET grade = 'D' WHERE grade IN ('D级', 'D级项目', 'D 类', 'D类');

UPDATE projects SET region = '东区' WHERE region IN ('东', '华东', '东部');
UPDATE projects SET region = '西区' WHERE region IN ('西', '华西', '西部');
UPDATE projects SET region = '南区' WHERE region IN ('南', '华南', '南部');
UPDATE projects SET region = '北区' WHERE region IN ('北', '华北', '北部');
UPDATE projects SET region = '中区' WHERE region IN ('中', '华中', '中部');
