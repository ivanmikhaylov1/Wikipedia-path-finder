CREATE TABLE `pagelinks` (
  `pl_from` int,
  `pl_from_namespace` int,
  `pl_target_id` bigint
);
INSERT INTO `pagelinks` VALUES (1,0,10),(1,0,12),(2,0,13),(3,0,11),(4,0,14),(6,1,10);
