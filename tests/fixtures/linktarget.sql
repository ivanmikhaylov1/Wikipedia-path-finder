CREATE TABLE `linktarget` (
  `lt_id` bigint,
  `lt_namespace` int,
  `lt_title` varbinary(255)
);
INSERT INTO `linktarget` VALUES (10,0,'B'),(11,0,'D'),(12,0,'C'),(13,0,'Alias'),(14,0,'Quoted\'s_(page)');
