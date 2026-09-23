import { describe, expect, it } from 'vitest';
import { MissingTenantContextError, scopeArgs } from './tenant-extension';

const SITE = 'site-a';

describe('scopeArgs', () => {
  it('siteye bağlı olmayan modellere dokunmaz', () => {
    const args = { where: { id: '1' } };
    expect(scopeArgs('User', 'findUnique', args, undefined)).toBe(args);
  });

  it('site bağlamı yoksa sorguyu engeller', () => {
    expect(() => scopeArgs('Unit', 'findMany', {}, undefined)).toThrow(MissingTenantContextError);
  });

  it.each([
    'findMany',
    'findFirst',
    'findUnique',
    'count',
    'update',
    'updateMany',
    'delete',
    'deleteMany',
  ])('%s sorgusuna siteId filtresi ekler', (operation) => {
    expect(scopeArgs('Unit', operation, { where: { id: 'u1' } }, SITE)).toEqual({
      where: { id: 'u1', siteId: SITE },
    });
  });

  it('başka siteye ait siteId verilse bile aktif site ile ezer', () => {
    expect(scopeArgs('Block', 'findMany', { where: { siteId: 'site-b' } }, SITE)).toEqual({
      where: { siteId: SITE },
    });
  });

  it('where olmayan sorgulara filtre ekler', () => {
    expect(scopeArgs('Block', 'findMany', undefined, SITE)).toEqual({ where: { siteId: SITE } });
  });

  it('create verisine siteId ekler ve başka site değerini ezer', () => {
    expect(scopeArgs('Block', 'create', { data: { name: 'A', siteId: 'site-b' } }, SITE)).toEqual({
      data: { name: 'A', siteId: SITE },
    });
  });

  it('createMany satırlarının her birine siteId ekler', () => {
    expect(
      scopeArgs('Unit', 'createMany', { data: [{ number: '1' }, { number: '2' }] }, SITE),
    ).toEqual({
      data: [
        { number: '1', siteId: SITE },
        { number: '2', siteId: SITE },
      ],
    });
  });

  it('upsert için hem where hem create kısmını kısıtlar', () => {
    expect(
      scopeArgs(
        'Block',
        'upsert',
        { where: { id: 'b1' }, create: { name: 'A' }, update: {} },
        SITE,
      ),
    ).toEqual({
      where: { id: 'b1', siteId: SITE },
      create: { name: 'A', siteId: SITE },
      update: {},
    });
  });
});
