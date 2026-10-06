CREATE DATABASE IF NOT EXISTS woo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS presta CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS magento CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL ON woo.* TO 'demo'@'%';
GRANT ALL ON presta.* TO 'demo'@'%';
GRANT ALL ON magento.* TO 'demo'@'%';
