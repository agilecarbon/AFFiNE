import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { WorkspaceFolder } from '@prisma/client';

import { BadRequest, NotFound } from '../base/error';
import { BaseModel } from './base';

export type WorkspaceFolderNodeType = 'folder' | 'doc' | 'tag' | 'collection';

@Injectable()
export class WorkspaceFolderModel extends BaseModel {
  async list(workspaceId: string, parentId: string | null) {
    return await this.db.workspaceFolder.findMany({
      where: {
        workspaceId,
        parentId,
      },
      orderBy: {
        index: 'asc',
      },
    });
  }

  async listAll(workspaceId: string) {
    return await this.db.workspaceFolder.findMany({
      where: {
        workspaceId,
      },
      orderBy: {
        index: 'asc',
      },
    });
  }

  async get(workspaceId: string, id: string) {
    return await this.db.workspaceFolder.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id,
        },
      },
    });
  }

  private async assertNode(workspaceId: string, id: string) {
    const node = await this.get(workspaceId, id);
    if (!node) {
      throw new NotFound(`Folder node ${id} not found in workspace ${workspaceId}`);
    }
    return node;
  }

  private async assertParent(workspaceId: string, parentId: string | null) {
    if (!parentId) {
      return null;
    }
    const parent = await this.assertNode(workspaceId, parentId);
    if (parent.type !== 'folder') {
      throw new BadRequest('Parent node must be a folder');
    }
    return parent;
  }

  async createFolder(
    workspaceId: string,
    parentId: string | null,
    name: string,
    index: string
  ) {
    if (parentId) {
      await this.assertParent(workspaceId, parentId);
    }
    const id = randomUUID();
    return await this.db.workspaceFolder.create({
      data: {
        workspaceId,
        id,
        parentId,
        type: 'folder',
        data: name,
        index,
      },
    });
  }

  async createLink(
    workspaceId: string,
    parentId: string,
    targetType: Exclude<WorkspaceFolderNodeType, 'folder'>,
    targetId: string,
    index: string
  ) {
    if (!parentId) {
      throw new BadRequest('Links must have a parent folder');
    }
    await this.assertParent(workspaceId, parentId);
    const id = randomUUID();
    return await this.db.workspaceFolder.create({
      data: {
        workspaceId,
        id,
        parentId,
        type: targetType,
        data: targetId,
        index,
      },
    });
  }

  async rename(workspaceId: string, id: string, name: string) {
    const node = await this.assertNode(workspaceId, id);
    if (node.type !== 'folder') {
      throw new BadRequest('Only folder nodes can be renamed');
    }
    return await this.db.workspaceFolder.update({
      where: {
        workspaceId_id: {
          workspaceId,
          id,
        },
      },
      data: {
        data: name,
      },
    });
  }

  private async isDescendant(
    workspaceId: string,
    nodeId: string,
    potentialParentId: string
  ) {
    let current: string | null = potentialParentId;
    while (current) {
      if (current === nodeId) {
        return true;
      }
      const parent = await this.db.workspaceFolder.findUnique({
        where: {
          workspaceId_id: {
            workspaceId,
            id: current,
          },
        },
        select: {
          parentId: true,
        },
      });
      current = parent?.parentId ?? null;
    }
    return false;
  }

  async move(
    workspaceId: string,
    id: string,
    parentId: string | null,
    index: string
  ) {
    const node = await this.assertNode(workspaceId, id);
    if (!parentId && node.type !== 'folder') {
      throw new BadRequest('Only folders can be moved to the root');
    }
    if (parentId) {
      await this.assertParent(workspaceId, parentId);
      if (await this.isDescendant(workspaceId, id, parentId)) {
        throw new BadRequest('Cannot move a folder into its descendant');
      }
    }
    return await this.db.workspaceFolder.update({
      where: {
        workspaceId_id: {
          workspaceId,
          id,
        },
      },
      data: {
        parentId,
        index,
      },
    });
  }

  async delete(workspaceId: string, id: string) {
    await this.assertNode(workspaceId, id);
    const queue: string[] = [id];
    const targets: string[] = [];
    while (queue.length) {
      const current = queue.pop()!;
      targets.push(current);
      const children = await this.db.workspaceFolder.findMany({
        where: {
          workspaceId,
          parentId: current,
        },
        select: { id: true },
      });
      for (const child of children) {
        queue.push(child.id);
      }
    }
    await this.db.workspaceFolder.deleteMany({
      where: {
        workspaceId,
        id: {
          in: targets,
        },
      },
    });
  }
}
