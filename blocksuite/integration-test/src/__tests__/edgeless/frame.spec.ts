import type { FrameBlockComponent } from '@blocksuite/affine/blocks/frame';
import type { EdgelessRootBlockComponent } from '@blocksuite/affine/blocks/root';
import type { FrameBlockModel } from '@blocksuite/affine/model';
import type { AffineFrameTitleWidget } from '@blocksuite/affine/widgets/frame-title';
import { assertType } from '@blocksuite/global/utils';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait, waitForCondition } from '../utils/common.js';
import { getDocRootBlock } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

describe('frame', () => {
  let service!: EdgelessRootBlockComponent['service'];

  beforeEach(async () => {
    const cleanup = await setupEditor('edgeless');
    service = getDocRootBlock(window.doc, window.editor, 'edgeless').service;

    return cleanup;
  });

  test('frame should have title', async () => {
    const frame = service.doc.addBlock(
      'affine:frame',
      {
        xywh: '[0,0,300,300]',
        title: new Text('Frame 1'),
      },
      service.surface.id
    );
    await wait();

    const getFrameTitle = (frameId: string) => {
      const frameTitleWidget = service.std.view.getWidget(
        'affine-frame-title-widget',
        frameId
      ) as AffineFrameTitleWidget | null;
      return frameTitleWidget?.shadowRoot?.querySelector('affine-frame-title');
    };

    await waitForCondition(
      () => Boolean(getFrameTitle(frame)),
      {
        timeout: 2000,
        message: 'Frame title widget was not rendered',
      }
    );

    const frameTitle = getFrameTitle(frame)!;
    const rect = frameTitle.getBoundingClientRect();

    expect(rect!.width).toBeGreaterThan(0);
    expect(rect!.height).toBeGreaterThan(0);

    const [titleX, titleY] = service.viewport.toModelCoordFromClientCoord([
      rect!.x,
      rect!.y,
    ]);
    expect(titleX).toBeCloseTo(0);
    expect(titleY).toBeLessThan(0);

    const nestedFrame = service.doc.addBlock(
      'affine:frame',
      {
        xywh: '[20,20,200,200]',
        title: new Text('Frame 2'),
      },
      service.surface.id
    );
    await wait();

    await waitForCondition(
      () => Boolean(getFrameTitle(nestedFrame)),
      {
        timeout: 2000,
        message: 'Nested frame title widget was not rendered',
      }
    );

    const nestedTitle = getFrameTitle(nestedFrame)!;

    const nestedTitleRect = nestedTitle.getBoundingClientRect()!;
    const [nestedTitleX, nestedTitleY] =
      service.viewport.toModelCoordFromClientCoord([
        nestedTitleRect.x,
        nestedTitleRect.y,
      ]);

    expect(nestedTitleX).toBeGreaterThan(20);
    expect(nestedTitleY).toBeGreaterThan(20);
  });

  test('frame should have externalXYWH after moving viewport to contains frame', async () => {
    const frameId = service.doc.addBlock(
      'affine:frame',
      {
        xywh: '[1800,1800,200,200]',
        title: new Text('Frame 1'),
      },
      service.surface.id
    );
    await wait();

    const frame = service.doc.getBlock(frameId);
    expect(frame).toBeTruthy();

    assertType<FrameBlockComponent>(frame);

    service.viewport.setCenter(900, 900);

    await waitForCondition(
      () => frame?.model.externalXYWH !== undefined,
      {
        timeout: 2000,
        message: 'Frame externalXYWH not computed after viewport move',
      }
    );

    expect(frame?.model.externalXYWH).toBeDefined();
  });

  test('descendant of frame should not contain itself', async () => {
    const frameIds = [1, 2, 3].map(i => {
      return service.doc.addBlock(
        'affine:frame',
        {
          xywh: '[0,0,300,300]',
          title: new Text(`Frame ${i}`),
        },
        service.surface.id
      );
    });

    await wait();

    const frames = frameIds.map(
      id => service.doc.getBlock(id)?.model as FrameBlockModel
    );

    frames.forEach(frame => {
      expect(frame.descendantElements).toHaveLength(0);
    });

    frames[0].addChild(frames[1]);
    frames[1].addChild(frames[2]);
    frames[2].addChild(frames[0]);

    await wait();
    expect(frames[0].descendantElements).toHaveLength(2);
    expect(frames[1].descendantElements).toHaveLength(1);
    expect(frames[2].descendantElements).toHaveLength(0);
  });
});
