CREATE TABLE `page` (
  `page_id` int,
  `page_namespace` int,
  `page_title` varbinary(255),
  `page_is_redirect` tinyint
);
INSERT INTO `page` VALUES (1,0,'A',0),(2,0,'B',0),(3,0,'C',0),(4,0,'D',0),(5,0,'Alias',1),(6,1,'Talk',0),(7,0,'Quoted\'s_(page)',0);
