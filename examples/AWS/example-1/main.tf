module "security_groups" {
  source            = "./modules/security_groups"
  vpc_id            = var.vpc_id
  allowed_ssh_cidr  = var.allowed_ssh_cidr
}

module "ec2" {
  source             = "./modules/ec2"
  ami_id             = var.ec2_ami_id
  instance_type      = var.ec2_instance_type
  subnet_id          = var.private_subnet_ids[0]
  security_group_ids = [module.security_groups.ec2_sg_id]
  project_name       = var.project_name
}

module "elasticache" {
  source                 = "./modules/elasticache"
  subnet_ids             = var.private_subnet_ids
  security_group_id      = module.security_groups.elasticache_sg_id
  node_type              = var.elasticache_node_type
  num_nodes              = var.elasticache_num_nodes
  project_name           = var.project_name
}
