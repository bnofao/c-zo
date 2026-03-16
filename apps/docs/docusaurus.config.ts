import type * as Preset from '@docusaurus/preset-classic'
import type { Config } from '@docusaurus/types'

const config: Config = {
  title: 'c-zo',
  tagline: 'Modular e-commerce platform',
  favicon: 'img/favicon.ico',
  url: 'https://docs.c-zo.dev',
  baseUrl: '/',
  organizationName: 'bnofao',
  projectName: 'c-zo',
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/bnofao/c-zo/tree/main/apps/docs/',
        },
        blog: {
          showReadingTime: true,
          editUrl: 'https://github.com/bnofao/c-zo/tree/main/apps/docs/',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      '@graphql-markdown/docusaurus',
      {
        schema: [
          '../../packages/kit/src/graphql/directives.graphql',
          '../../packages/kit/src/graphql/base-types.graphql',
          '../../packages/kit/src/graphql/filter-types.graphql',
          '../../packages/modules/*/src/graphql/schema/**/*.graphql',
        ],
        rootPath: './docs',
        baseURL: 'api/graphql',
        homepage: './docs/api/graphql/index.md',
        loaders: {
          GraphQLFileLoader: '@graphql-tools/graphql-file-loader',
        },
      },
    ],
    [
      'docusaurus-plugin-openapi-docs',
      {
        id: 'openapi',
        docsPluginId: 'classic',
        config: {
          api: {
            specPath: './openapi/openapi.json',
            outputDir: './docs/api/rest',
          },
        },
      },
    ],
  ],

  markdown: {
    mermaid: true,
  },

  themes: ['docusaurus-theme-openapi-docs', '@docusaurus/theme-mermaid'],

  themeConfig: {
    navbar: {
      title: 'c-zo',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'guidesSidebar',
          position: 'left',
          label: 'Guides',
        },
        {
          type: 'docSidebar',
          sidebarId: 'modulesSidebar',
          position: 'left',
          label: 'Modules',
        },
        {
          type: 'docSidebar',
          sidebarId: 'apiSidebar',
          position: 'left',
          label: 'API Reference',
        },
        { to: '/blog', label: 'Blog', position: 'left' },
        {
          href: 'https://github.com/bnofao/c-zo',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Guides', to: '/docs/guides/intro' },
            { label: 'Modules', to: '/docs/modules/kit/overview' },
            { label: 'API Reference', to: '/docs/api/graphql' },
          ],
        },
        {
          title: 'Community',
          items: [
            { label: 'GitHub', href: 'https://github.com/bnofao/c-zo' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} c-zo. Built with Docusaurus.`,
    },
    prism: {
      additionalLanguages: ['bash', 'graphql', 'json', 'typescript'],
    },
  } satisfies Preset.ThemeConfig,
}

export default config
