CREATE TABLE `redirect` (
  `rd_from` int,
  `rd_namespace` int,
  `rd_title` varbinary(255),
  `rd_interwiki` varbinary(32)
);
INSERT INTO `redirect` VALUES (5,0,'D','');
