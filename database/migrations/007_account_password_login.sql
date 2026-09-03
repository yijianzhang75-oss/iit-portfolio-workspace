ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN username_normalized TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;

CREATE UNIQUE INDEX users_username_normalized_unique
  ON users(username_normalized)
  WHERE username_normalized IS NOT NULL;
