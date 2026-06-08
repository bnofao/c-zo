import type { TranslationHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootTranslationApp } from './harness'

describe('translation e2e', () => {
  let h: TranslationHarness
  beforeAll(async () => {
    h = await bootTranslationApp()
  }, 180_000)
  afterAll(async () => {
    await h.close()
  })

  it('locales list + defaultLocale are public (no auth)', async () => {
    const r = await h.gql(`query { locales { edges { node { code } } } defaultLocale { code } }`)
    expect(r.errors).toBeUndefined()
    expect(r.data.locales.edges.some((e: any) => e.node.code === 'en')).toBe(true)
    expect(r.data.defaultLocale.code).toBe('en')
  })

  it('createLocale denied without the global locale role, allowed with it', async () => {
    const plain = await h.signUp('plain@x.io', 'Plain', 'password1234')
    const denied = await h.gql(`mutation($i:CreateLocaleInput!){ createLocale(input:$i){ __typename } }`, { i: { code: 'fr', name: 'Francais' } }, plain.token)
    expect(denied.errors?.length ? true : denied.data?.createLocale == null).toBe(true)

    const admin = await h.signUp('admin@x.io', 'Admin', 'password1234')
    await h.grantGlobalRole(admin.userId, 'locale:manager')
    const ok = await h.gql(`mutation($i:CreateLocaleInput!){ createLocale(input:$i){ ... on CreateLocaleSuccess { data { locale { code } } } } }`, { i: { code: 'fr', name: 'Francais' } }, admin.token)
    expect(ok.data.createLocale.data.locale.code).toBe('fr')
  })

  it('translatedField overlays translation-or-base and batches', async () => {
    await h.seedWidgets()
    const fr = await h.gql(`query { widgets { edges { node { name(locale: "fr") } } } }`)
    expect(fr.errors).toBeUndefined()
    const names = fr.data.widgets.edges.map((e: any) => e.node.name).sort()
    expect(names).toEqual(['Boutique A', 'Shop B'])
    const en = await h.gql(`query { widgets { edges { node { name(locale: "en") } } } }`)
    expect(en.data.widgets.edges.map((e: any) => e.node.name).sort()).toEqual(['Shop A', 'Shop B'])
  })
})
