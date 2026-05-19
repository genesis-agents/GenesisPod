import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { SocialDataSourceController } from '../social-data-source.controller';
import { SocialDataSourceRegistry } from '../../registry/social-data-source.registry';
import {
  SocialDataSource,
  SocialDataSourceDescriptor,
  SourceListFilter,
  SourceListResult,
  SourceContentBundle,
} from '../../../../contracts/social-data-source';

function makeSource(
  overrides: Partial<SocialDataSource> = {},
): SocialDataSource {
  return {
    id: 'test-source',
    displayName: { 'zh-CN': '测试来源', 'en-US': 'Test Source' },
    icon: 'icon-test',
    description: { 'zh-CN': '描述', 'en-US': 'Description' },
    contentKinds: ['article'],
    listItems: jest.fn().mockResolvedValue({ items: [], nextCursor: undefined }),
    fetchBundle: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeRegistry(
  sources: SocialDataSource[] = [],
): SocialDataSourceRegistry {
  const registry = new SocialDataSourceRegistry(undefined);
  for (const src of sources) {
    registry.register(src);
  }
  return registry;
}

describe('SocialDataSourceController', () => {
  describe('list()', () => {
    it('returns descriptors from registry', () => {
      const src = makeSource();
      const registry = makeRegistry([src]);
      const controller = new SocialDataSourceController(registry);

      const result = controller.list();

      expect(result.items).toHaveLength(1);
      const descriptor = result.items[0] as SocialDataSourceDescriptor;
      expect(descriptor.id).toBe('test-source');
      expect(descriptor).not.toHaveProperty('listItems');
      expect(descriptor).not.toHaveProperty('fetchBundle');
    });

    it('returns empty items when registry has no sources', () => {
      const registry = makeRegistry();
      const controller = new SocialDataSourceController(registry);

      expect(controller.list()).toEqual({ items: [] });
    });
  });

  describe('listItems()', () => {
    it('throws NotFoundException when source id is unknown', async () => {
      const registry = makeRegistry();
      const controller = new SocialDataSourceController(registry);

      await expect(
        controller.listItems('nonexistent', undefined, undefined, undefined, {
          user: { id: 'user-123' },
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws UnauthorizedException when userId is missing', async () => {
      const src = makeSource();
      const registry = makeRegistry([src]);
      const controller = new SocialDataSourceController(registry);

      await expect(
        controller.listItems('test-source', undefined, undefined, undefined, {}),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when req is undefined', async () => {
      const src = makeSource();
      const registry = makeRegistry([src]);
      const controller = new SocialDataSourceController(registry);

      await expect(
        controller.listItems('test-source', undefined, undefined, undefined, undefined),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('calls source.listItems with correct userId and filter', async () => {
      const listItems = jest
        .fn<Promise<SourceListResult>, [string, SourceListFilter]>()
        .mockResolvedValue({ items: [] });
      const src = makeSource({ listItems });
      const registry = makeRegistry([src]);
      const controller = new SocialDataSourceController(registry);

      const result = await controller.listItems(
        'test-source',
        'my query',
        'cursor-abc',
        '15',
        { user: { id: 'user-xyz' } },
      );

      expect(listItems).toHaveBeenCalledWith('user-xyz', {
        search: 'my query',
        cursor: 'cursor-abc',
        limit: 15,
      });
      expect(result).toEqual({ items: [] });
    });

    it('defaults limit to 30 when limit param is absent', async () => {
      const listItems = jest
        .fn<Promise<SourceListResult>, [string, SourceListFilter]>()
        .mockResolvedValue({ items: [] });
      const src = makeSource({ listItems });
      const registry = makeRegistry([src]);
      const controller = new SocialDataSourceController(registry);

      await controller.listItems(
        'test-source',
        undefined,
        undefined,
        undefined,
        { user: { id: 'user-xyz' } },
      );

      expect(listItems).toHaveBeenCalledWith('user-xyz', {
        search: undefined,
        cursor: undefined,
        limit: 30,
      });
    });
  });
});
