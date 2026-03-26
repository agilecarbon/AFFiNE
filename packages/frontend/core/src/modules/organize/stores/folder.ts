import {
  workspaceFolderCreateLinkMutation,
  workspaceFolderCreateMutation,
  workspaceFolderDeleteMutation,
  workspaceFolderMoveMutation,
  workspaceFolderRenameMutation,
  workspaceFolderTreeQuery,
  type WorkspaceFolderNodeType,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { WorkspaceServerService } from '../../cloud';
import type { WorkspaceDBService } from '../../db';
import type { WorkspaceService } from '../../workspace';

type FolderNodeRecord = {
  id: string;
  parentId?: string | null;
  type: WorkspaceFolderNodeType | 'folder' | 'doc' | 'tag' | 'collection';
  data: string;
  index: string;
};

export class FolderStore extends Store {
  private cloudSyncPromise: Promise<void> | null = null;
  private cloudInitialized = false;

  constructor(
    private readonly dbService: WorkspaceDBService,
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceServerService: WorkspaceServerService
  ) {
    super();

    if (this.useCloudBackend) {
      this.syncFromCloud().catch(console.error);
      const subscription = this.workspaceServerService.server$.subscribe(
        server => {
          if (server && this.useCloudBackend) {
            this.syncFromCloud(true).catch(console.error);
          }
        }
      );
      this.disposables.push(() => subscription.unsubscribe());
    }
  }

  private get workspaceId() {
    return this.workspaceService.workspace.id;
  }

  private get useCloudBackend() {
    return this.workspaceService.workspace.meta.flavour !== 'local';
  }

  private async getCloudClient() {
    if (!this.useCloudBackend) {
      return null;
    }
    if (this.workspaceServerService.server) {
      return this.workspaceServerService.server.gql;
    }
    const server = await this.workspaceServerService.server$.waitFor(
      value => !!value
    );
    return server.gql;
  }

  private async ensureCloudInitialized() {
    if (!this.useCloudBackend) {
      return;
    }
    if (this.cloudInitialized) {
      if (this.cloudSyncPromise) {
        await this.cloudSyncPromise;
      }
      return;
    }
    await this.syncFromCloud();
  }

  private async syncFromCloud(force = false) {
    if (!this.useCloudBackend) {
      return;
    }
    if (this.cloudSyncPromise) {
      if (!force) {
        return this.cloudSyncPromise;
      }
      await this.cloudSyncPromise;
    }
    const gql = await this.getCloudClient();
    if (!gql) {
      return;
    }
    this.cloudSyncPromise = (async () => {
      try {
        const { workspaceFolderTree } = await gql({
          query: workspaceFolderTreeQuery,
          variables: {
            workspaceId: this.workspaceId,
          },
        });
        await this.replaceLocalTree(workspaceFolderTree);
        this.cloudInitialized = true;
      } finally {
        this.cloudSyncPromise = null;
      }
    })();
    return this.cloudSyncPromise;
  }

  private async replaceLocalTree(
    nodes: {
      id: string;
      parentId?: string | null;
      data: string;
      index: string;
      type: WorkspaceFolderNodeType;
    }[]
  ) {
    const table = this.dbService.db.folders;
    const keys = await table.keys();
    await Promise.all(keys.map(id => table.delete(id)));
    for (const node of nodes) {
      await table.create({
        id: node.id,
        parentId: node.parentId ?? undefined,
        data: node.data,
        index: node.index,
        type: node.type,
      });
    }
  }

  private async upsertLocalNode(node: FolderNodeRecord) {
    const table = this.dbService.db.folders;
    const payload = {
      id: node.id,
      parentId: node.parentId ?? undefined,
      type: node.type,
      data: node.data,
      index: node.index,
    };
    if (await table.get(node.id)) {
      await table.update(node.id, payload);
    } else {
      await table.create(payload);
    }
  }

  watchNodeInfo(nodeId: string) {
    return this.dbService.db.folders.get$(nodeId);
  }

  watchNodeChildren(parentId: string | null) {
    return this.dbService.db.folders.find$({
      parentId: parentId,
    });
  }

  watchIsLoading() {
    return this.dbService.db.folders.isLoading$;
  }

  isAncestor(childId: string, ancestorId: string): boolean {
    if (childId === ancestorId) {
      return false;
    }
    const history = new Set<string>([childId]);
    let current: string = childId;
    while (current) {
      const info = this.dbService.db.folders.get(current);
      if (info === null || !info.parentId) {
        return false;
      }
      current = info.parentId;
      if (history.has(current)) {
        return false; // loop detected
      }
      history.add(current);
      if (current === ancestorId) {
        return true;
      }
    }
    return false;
  }

  async createLink(
    parentId: string,
    type: 'doc' | 'tag' | 'collection',
    nodeId: string,
    index: string
  ) {
    const parent = this.dbService.db.folders.get(parentId);
    if (parent === null || parent.type !== 'folder') {
      throw new Error('Parent folder not found');
    }

    if (!this.useCloudBackend) {
      await this.dbService.db.folders.create({
        parentId,
        type,
        data: nodeId,
        index: index,
      });
      return;
    }

    await this.ensureCloudInitialized();
    const gql = await this.getCloudClient();
    if (!gql) {
      return;
    }
    const { workspaceFolderCreateLink } = await gql({
      query: workspaceFolderCreateLinkMutation,
      variables: {
        input: {
          workspaceId: this.workspaceId,
          parentId,
          targetType: type,
          targetId: nodeId,
          index,
        },
      },
    });
    await this.upsertLocalNode(workspaceFolderCreateLink);
  }

  async renameNode(nodeId: string, name: string) {
    const node = this.dbService.db.folders.get(nodeId);
    if (node === null) {
      throw new Error('Node not found');
    }
    if (node.type !== 'folder') {
      throw new Error('Cannot rename non-folder node');
    }

    if (!this.useCloudBackend) {
      await this.dbService.db.folders.update(nodeId, {
        data: name,
      });
      return;
    }

    await this.ensureCloudInitialized();
    const gql = await this.getCloudClient();
    if (!gql) {
      return;
    }
    const { workspaceFolderRename } = await gql({
      query: workspaceFolderRenameMutation,
      variables: {
        input: {
          workspaceId: this.workspaceId,
          id: nodeId,
          name,
        },
      },
    });
    await this.upsertLocalNode(workspaceFolderRename);
  }

  async createFolder(parentId: string | null, name: string, index: string) {
    if (parentId) {
      const parent = this.dbService.db.folders.get(parentId);
      if (parent === null || parent.type !== 'folder') {
        throw new Error('Parent folder not found');
      }
    }

    if (!this.useCloudBackend) {
      return this.dbService.db.folders.create({
        parentId: parentId,
        type: 'folder',
        data: name,
        index: index,
      }).id;
    }

    await this.ensureCloudInitialized();
    const gql = await this.getCloudClient();
    if (!gql) {
      throw new Error('Workspace server unavailable');
    }
    const { workspaceFolderCreate } = await gql({
      query: workspaceFolderCreateMutation,
      variables: {
        input: {
          workspaceId: this.workspaceId,
          parentId: parentId ?? undefined,
          name,
          index,
        },
      },
    });
    await this.upsertLocalNode(workspaceFolderCreate);
    return workspaceFolderCreate.id;
  }

  async removeFolder(folderId: string) {
    const info = this.dbService.db.folders.get(folderId);
    if (info === null || info.type !== 'folder') {
      throw new Error('Folder not found');
    }

    if (!this.useCloudBackend) {
      const stack = [info];
      while (stack.length > 0) {
        const current = stack.pop();
        if (!current) {
          continue;
        }
        if (current.type !== 'folder') {
          this.dbService.db.folders.delete(current.id);
        } else {
          const children = this.dbService.db.folders.find({
            parentId: current.id,
          });
          stack.push(...children);
          this.dbService.db.folders.delete(current.id);
        }
      }
      return;
    }

    await this.ensureCloudInitialized();
    const gql = await this.getCloudClient();
    if (!gql) {
      return;
    }
    await gql({
      query: workspaceFolderDeleteMutation,
      variables: {
        input: {
          workspaceId: this.workspaceId,
          id: folderId,
        },
      },
    });
    await this.syncFromCloud(true);
  }

  async removeLink(linkId: string) {
    const link = this.dbService.db.folders.get(linkId);
    if (link === null || link.type === 'folder') {
      throw new Error('Link not found');
    }

    if (!this.useCloudBackend) {
      await this.dbService.db.folders.delete(linkId);
      return;
    }

    await this.ensureCloudInitialized();
    const gql = await this.getCloudClient();
    if (!gql) {
      return;
    }
    await gql({
      query: workspaceFolderDeleteMutation,
      variables: {
        input: {
          workspaceId: this.workspaceId,
          id: linkId,
        },
      },
    });
    await this.syncFromCloud(true);
  }

  async moveNode(nodeId: string, parentId: string | null, index: string) {
    const node = this.dbService.db.folders.get(nodeId);
    if (node === null) {
      throw new Error('Node not found');
    }

    if (parentId) {
      if (nodeId === parentId) {
        throw new Error('Cannot move a node to itself');
      }
      if (this.isAncestor(parentId, nodeId)) {
        throw new Error('Cannot move a node to its descendant');
      }
      const parent = this.dbService.db.folders.get(parentId);
      if (parent === null || parent.type !== 'folder') {
        throw new Error('Parent folder not found');
      }
    } else if (node.type !== 'folder') {
      throw new Error('Root node can only have folders');
    }

    if (!this.useCloudBackend) {
      await this.dbService.db.folders.update(nodeId, {
        parentId,
        index,
      });
      return;
    }

    await this.ensureCloudInitialized();
    const gql = await this.getCloudClient();
    if (!gql) {
      return;
    }
    const { workspaceFolderMove } = await gql({
      query: workspaceFolderMoveMutation,
      variables: {
        input: {
          workspaceId: this.workspaceId,
          id: nodeId,
          parentId: parentId ?? undefined,
          index,
        },
      },
    });
    await this.upsertLocalNode(workspaceFolderMove);
  }
}
