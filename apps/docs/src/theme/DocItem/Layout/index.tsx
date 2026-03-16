import React, { type ReactNode, useEffect, useRef } from 'react';
import Layout from '@theme-original/DocItem/Layout';
import type LayoutType from '@theme/DocItem/Layout';
import type { WrapperProps } from '@docusaurus/types';
import { useLocation } from '@docusaurus/router';

type Props = WrapperProps<typeof LayoutType>;

export default function LayoutWrapper(props: Props): ReactNode {
  const location = useLocation();
  const isApiPage = location.pathname.includes('/api/graphql/');
  const contentRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isApiPage) return;

    const contentEl = contentRef.current;
    const codeEl = codeRef.current;
    if (!contentEl || !codeEl) return;

    // Clear existing children
    while (codeEl.firstChild) {
      codeEl.removeChild(codeEl.firstChild);
    }

    // Clone all pre elements into the code panel and hide originals
    const preElements = contentEl.querySelectorAll('pre');
    preElements.forEach((pre) => {
      const clone = pre.cloneNode(true) as HTMLElement;
      codeEl.appendChild(clone);

      // Hide the original container
      const container = pre.closest('div[class*="codeBlockContainer"]');
      if (container) {
        (container as HTMLElement).style.display = 'none';
      } else {
        pre.style.display = 'none';
      }
    });
  }, [location.pathname, isApiPage]);

  if (!isApiPage) {
    return <Layout {...props} />;
  }

  return (
    <div className="api-split-layout">
      <div className="api-split-layout__content" ref={contentRef}>
        <Layout {...props} />
      </div>
      <div className="api-split-layout__code" ref={codeRef} />
    </div>
  );
}
