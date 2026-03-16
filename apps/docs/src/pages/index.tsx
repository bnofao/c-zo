import Link from '@docusaurus/Link'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import Layout from '@theme/Layout'
import type { ReactNode } from 'react'

function Hero() {
  const { siteConfig } = useDocusaurusContext()
  return (
    <div className="hero-container">
      <div className="hero-content">
        <span className="hero-badge">Open Source</span>
        <h1 className="hero-title">{siteConfig.title}</h1>
        <p className="hero-subtitle">{siteConfig.tagline}</p>
        <p className="hero-description">
          Composable modules for marketplaces, delivery platforms, ticketing
          systems, and more. Built with TypeScript, Nitro, and GraphQL.
        </p>
        <div className="hero-buttons">
          <Link className="hero-button hero-button--primary" to="/docs/guides/getting-started">
            Get Started
          </Link>
          <Link className="hero-button hero-button--outline" to="/docs/api/graphql">
            API Reference
          </Link>
        </div>
      </div>
    </div>
  )
}

const features: { title: string; description: string; link: string; icon: string }[] = [
  {
    title: 'Guides',
    description:
      'Set up your environment, understand the architecture, and learn how to build modules.',
    link: '/docs/guides/getting-started',
    icon: '📖',
  },
  {
    title: 'Modules',
    description:
      'Deep-dive into Kit, Auth, Stock Location, and every module in the platform.',
    link: '/docs/modules/kit/overview',
    icon: '🧩',
  },
  {
    title: 'GraphQL API',
    description:
      'Auto-generated reference for all queries, mutations, types, and inputs.',
    link: '/docs/api/graphql',
    icon: '⚡',
  },
  {
    title: 'Architecture',
    description:
      'Module system, IoC container, event bus, Repository pattern, and data flow.',
    link: '/docs/guides/architecture',
    icon: '🏗️',
  },
  {
    title: 'Create a Module',
    description:
      'Step-by-step tutorial to build a module from scratch using stock-location as example.',
    link: '/docs/guides/creating-a-module',
    icon: '🛠️',
  },
  {
    title: 'Conventions',
    description: 'Coding style, testing requirements, git workflow, and security guidelines.',
    link: '/docs/guides/conventions',
    icon: '📏',
  },
]

function FeatureCard({ title, description, link, icon }: (typeof features)[number]) {
  return (
    <Link to={link} className="feature-card">
      <span className="feature-card__icon">{icon}</span>
      <h3 className="feature-card__title">{title}</h3>
      <p className="feature-card__description">{description}</p>
    </Link>
  )
}

function Features() {
  return (
    <section className="features-section">
      <div className="features-grid">
        {features.map((feature) => (
          <FeatureCard key={feature.title} {...feature} />
        ))}
      </div>
    </section>
  )
}

export default function Home(): ReactNode {
  return (
    <Layout description="Documentation for the c-zo modular e-commerce platform">
      <Hero />
      <Features />
    </Layout>
  )
}
