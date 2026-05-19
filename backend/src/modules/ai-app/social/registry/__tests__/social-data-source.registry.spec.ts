import { SocialDataSourceRegistry } from '../social-data-source.registry';
import { SocialDataSource, SourceListFilter, SourceListResult, SourceContentBundle } from '../../../contracts/social-data-source';

function makeSource(id: string): SocialDataSource {
  return {
    id,
    displayName: { 'zh-CN': `来源${id}`, 'en-US': `Source ${id}` },
    icon: 'icon-test',
    description: { 'zh-CN': '描述', 'en-US': 'Description' },
    contentKinds: ['article'],
    maxItemsPerTask: 10,
    listItems: (_userId: string, _filter: SourceListFilter): Promise<SourceListResult> =>
      Promise.resolve({ items: [] }),
    fetchBundle: (_itemIds: string[], _userId: string): Promise<SourceContentBundle[]> =>
      Promise.resolve([]),
  };
}

describe('SocialDataSourceRegistry', () => {
  describe('single source: register / get / list / listDescriptors', () => {
    let registry: SocialDataSourceRegistry;

    beforeEach(() => {
      registry = new SocialDataSourceRegistry(undefined);
    });

    it('registers a source and retrieves it by id', () => {
      const src = makeSource('library');
      registry.register(src);

      expect(registry.get('library')).toBe(src);
    });

    it('list() returns all registered sources', () => {
      const src = makeSource('library');
      registry.register(src);

      expect(registry.list()).toEqual([src]);
    });

    it('listDescriptors() strips listItems and fetchBundle', () => {
      const src = makeSource('library');
      registry.register(src);

      const descriptors = registry.listDescriptors();
      expect(descriptors).toHaveLength(1);
      expect(descriptors[0]).not.toHaveProperty('listItems');
      expect(descriptors[0]).not.toHaveProperty('fetchBundle');
      expect(descriptors[0].id).toBe('library');
      expect(descriptors[0].displayName['zh-CN']).toBe('来源library');
    });

    it('get() returns undefined for unknown id', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('list() returns empty array when no sources registered', () => {
      expect(registry.list()).toEqual([]);
    });
  });

  describe('duplicate id throws', () => {
    it('throws Error when registering duplicate id', () => {
      const registry = new SocialDataSourceRegistry(undefined);
      registry.register(makeSource('dup'));

      expect(() => registry.register(makeSource('dup'))).toThrow(
        'Duplicate social data source id: dup',
      );
    });
  });

  describe('multi-provider injection via constructor', () => {
    it('accepts array of sources injected via constructor', () => {
      const src1 = makeSource('source-a');
      const src2 = makeSource('source-b');

      const registry = new SocialDataSourceRegistry([src1, src2]);

      expect(registry.get('source-a')).toBe(src1);
      expect(registry.get('source-b')).toBe(src2);
      expect(registry.list()).toHaveLength(2);
    });

    it('throws when injected array contains duplicate ids', () => {
      const src1 = makeSource('dup');
      const src2 = makeSource('dup');

      expect(() => new SocialDataSourceRegistry([src1, src2])).toThrow(
        'Duplicate social data source id: dup',
      );
    });
  });
});
