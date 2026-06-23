import { T, TolgeeProvider } from '@tolgee/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createTolgee } from './tolgee'

// Eager staticData objects resolve synchronously, so a server render (no
// effects) emits the translated value directly — the SSR no-flash guarantee.
function render(language: string) {
  return renderToStaticMarkup(
    <TolgeeProvider tolgee={createTolgee(language)} options={{ useSuspense: false }}>
      <T keyName="nav.signOut" />
    </TolgeeProvider>,
  )
}

describe('createTolgee static data', () => {
  it('renders the English value when language is en', () => {
    expect(render('en')).toContain('Sign out')
  })
  it('renders the French value when language is fr-FR', () => {
    expect(render('fr-FR')).toContain('Se déconnecter')
  })
})
