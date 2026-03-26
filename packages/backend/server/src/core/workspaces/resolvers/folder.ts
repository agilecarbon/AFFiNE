import {
  Args,
  Field,
  InputType,
  Mutation,
  ObjectType,
  Query,
  registerEnumType,
  Resolver,
} from '@nestjs/graphql';
import type { WorkspaceFolder } from '@prisma/client';

import { BadRequest, NotFound } from '../../../base';
import { Models } from '../../../models';
import { CurrentUser } from '../../auth';
import { Action, AccessController } from '../../permission';

export enum WorkspaceFolderNodeType {
  Folder = 'folder',
  Doc = 'doc',
  Tag = 'tag',
  Collection = 'collection',
}

registerEnumType(WorkspaceFolderNodeType, {
  name: 'WorkspaceFolderNodeType',
});

@ObjectType()
export class WorkspaceFolderNode {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => String)
  id!: string;

  @Field(() => String, { nullable: true })
  parentId!: string | null;

  @Field(() => WorkspaceFolderNodeType)
  type!: WorkspaceFolderNodeType;

  @Field(() => String)
  data!: string;

  @Field(() => String)
  index!: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

function mapNode(node: WorkspaceFolder): WorkspaceFolderNode {
  return {
    workspaceId: node.workspaceId,
    id: node.id,
    parentId: node.parentId ?? null,
    type: node.type as WorkspaceFolderNodeType,
    data: node.data,
    index: node.index,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

@InputType()
class WorkspaceFolderListInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => String, { nullable: true })
  parentId?: string;
}

@InputType()
class WorkspaceFolderCreateInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => String, { nullable: true })
  parentId?: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  index!: string;
}

@InputType()
class WorkspaceFolderCreateLinkInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => String)
  parentId!: string;

  @Field(() => WorkspaceFolderNodeType)
  targetType!: WorkspaceFolderNodeType;

  @Field(() => String)
  targetId!: string;

  @Field(() => String)
  index!: string;
}

@InputType()
class WorkspaceFolderRenameInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;
}

@InputType()
class WorkspaceFolderMoveInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => String)
  id!: string;

  @Field(() => String, { nullable: true })
  parentId?: string;

  @Field(() => String)
  index!: string;
}

@InputType()
class WorkspaceFolderDeleteInput {
  @Field(() => String)
  workspaceId!: string;

  @Field(() => String)
  id!: string;
}

@Resolver(() => WorkspaceFolderNode)
export class WorkspaceFolderResolver {
  constructor(
    private readonly ac: AccessController,
    private readonly models: Models
  ) {}

  private ensureManagePermission(userId: string, workspaceId: string) {
    return this.ac.user(userId).workspace(workspaceId).assert(
      Action.Workspace.Organize.Manage
    );
  }

  private ensureReadPermission(userId: string, workspaceId: string) {
    return this.ac
      .user(userId)
      .workspace(workspaceId)
      .assert(Action.Workspace.Organize.Read);
  }

  @Query(() => [WorkspaceFolderNode], {
    description: 'List folder nodes for a workspace and optional parent',
  })
  async workspaceFolders(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: WorkspaceFolderListInput
  ) {
    await this.ensureReadPermission(user.id, input.workspaceId);
    const nodes = await this.models.workspaceFolder.list(
      input.workspaceId,
      input.parentId ?? null
    );
    return nodes.map(mapNode);
  }

  @Query(() => [WorkspaceFolderNode], {
    description: 'List all folder nodes for a workspace',
  })
  async workspaceFolderTree(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string
  ) {
    await this.ensureReadPermission(user.id, workspaceId);
    const nodes = await this.models.workspaceFolder.listAll(workspaceId);
    return nodes.map(mapNode);
  }

  @Query(() => WorkspaceFolderNode, {
    description: 'Get a single folder node by id',
  })
  async workspaceFolder(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('id') id: string
  ) {
    await this.ensureReadPermission(user.id, workspaceId);
    const node = await this.models.workspaceFolder.get(workspaceId, id);
    if (!node) {
      throw new NotFound('Folder node not found');
    }
    return mapNode(node);
  }

  @Mutation(() => WorkspaceFolderNode)
  async workspaceFolderCreate(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: WorkspaceFolderCreateInput
  ) {
    await this.ensureManagePermission(user.id, input.workspaceId);
    const node = await this.models.workspaceFolder.createFolder(
      input.workspaceId,
      input.parentId ?? null,
      input.name,
      input.index
    );
    return mapNode(node);
  }

  @Mutation(() => WorkspaceFolderNode)
  async workspaceFolderCreateLink(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: WorkspaceFolderCreateLinkInput
  ) {
    if (input.targetType === WorkspaceFolderNodeType.Folder) {
      throw new BadRequest('Use workspaceFolderCreate for folders');
    }
    await this.ensureManagePermission(user.id, input.workspaceId);
    const node = await this.models.workspaceFolder.createLink(
      input.workspaceId,
      input.parentId,
      input.targetType as Exclude<WorkspaceFolderNodeType, 'folder'>,
      input.targetId,
      input.index
    );
    return mapNode(node);
  }

  @Mutation(() => WorkspaceFolderNode)
  async workspaceFolderRename(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: WorkspaceFolderRenameInput
  ) {
    await this.ensureManagePermission(user.id, input.workspaceId);
    const node = await this.models.workspaceFolder.rename(
      input.workspaceId,
      input.id,
      input.name
    );
    return mapNode(node);
  }

  @Mutation(() => WorkspaceFolderNode)
  async workspaceFolderMove(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: WorkspaceFolderMoveInput
  ) {
    await this.ensureManagePermission(user.id, input.workspaceId);
    const node = await this.models.workspaceFolder.move(
      input.workspaceId,
      input.id,
      input.parentId ?? null,
      input.index
    );
    return mapNode(node);
  }

  @Mutation(() => Boolean)
  async workspaceFolderDelete(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: WorkspaceFolderDeleteInput
  ) {
    await this.ensureManagePermission(user.id, input.workspaceId);
    await this.models.workspaceFolder.delete(input.workspaceId, input.id);
    return true;
  }
}
