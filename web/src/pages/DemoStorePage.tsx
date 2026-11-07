// A sample customer site: a storefront for the fictional Nimbus Audio, rendered
// entirely from the same knowledge base the assistant answers from, with the real
// widget embedded. Editing a product in the console changes this page.
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, ErrorState, SkeletonRows } from '../components/ui';
import { api } from '../lib/api';
import { money } from '../lib/format';
import type { Catalog } from '../lib/types';
import { openWidget, useWidget } from '../lib/useWidget';

function availabilityClass(availability: string): string {
  const text = availability.toLowerCase();
  if (text.includes('in stock')) return 'badge-good';
  if (text.includes('low') || text.includes('pre-order') || text.includes('preorder')) return 'badge-warn';
  return '';
}

export function DemoStorePage() {
  useWidget();
  const [category, setCategory] = useState('');
  const query = useQuery({ queryKey: ['catalog'], queryFn: () => api.get<Catalog>('/public/catalog') });

  const demoBar = (
    <div className="demo-bar">
      <Link to="/" className="inline-icon"><ArrowLeft aria-hidden /> Groundline</Link>
      <span>Demo storefront for a fictional brand. Nothing here is for sale.</span>
    </div>
  );

  if (query.isPending) return <div className="store">{demoBar}<SkeletonRows rows={10} /></div>;
  if (query.isError) return <div className="store">{demoBar}<ErrorState error={query.error} onRetry={() => query.refetch()} /></div>;

  const { brand, products, policies } = query.data;
  const categories = [...new Set(products.map((p) => p.category))];
  const visible = category ? products.filter((p) => p.category === category) : products;

  return (
    <div className="store">
      {demoBar}
      <header className="store-hero">
        <div className="store-inner">
          <p className="store-brand">{brand.name}</p>
          <h1>{brand.tagline}</h1>
          <p className="store-about">{brand.about}</p>
          <Button variant="primary" size="lg" onClick={openWidget}>Ask the assistant</Button>
        </div>
      </header>

      <main className="store-inner store-main">
        <section aria-labelledby="products-title">
          <div className="store-section-head">
            <h2 id="products-title">Products</h2>
            <div className="chip-filter" role="group" aria-label="Filter by category">
              <button type="button" aria-pressed={category === ''} onClick={() => setCategory('')}>All</button>
              {categories.map((name) => (
                <button key={name} type="button" aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>
              ))}
            </div>
          </div>
          {visible.length ? (
            <ul className="product-grid">
              {visible.map((product) => (
                <li key={product.id} className="product">
                  <div className="product-top">
                    <span className="product-category">{product.category}</span>
                    <span className={`badge ${availabilityClass(product.availability)}`}>{product.availability}</span>
                  </div>
                  <h3>{product.name}</h3>
                  <p className="product-desc">{product.shortDescription}</p>
                  <ul className="product-highlights">
                    {product.highlights.slice(0, 3).map((highlight) => (
                      <li key={highlight}><Check aria-hidden /> {highlight}</li>
                    ))}
                  </ul>
                  <p className="product-price tnum">{money(product.price, brand.currency)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No products are live right now.</p>
          )}
        </section>

        {brand.uniqueSellingPoints.length ? (
          <section aria-labelledby="why-title">
            <h2 id="why-title">Why {brand.name}</h2>
            <ul className="usp-list">
              {brand.uniqueSellingPoints.map((point) => <li key={point}>{point}</li>)}
            </ul>
          </section>
        ) : null}

        {policies.length ? (
          <section aria-labelledby="policies-title">
            <h2 id="policies-title">Policies</h2>
            <dl className="policy-list">
              {policies.map((policy) => (
                <div key={policy.id}>
                  <dt>{policy.title}</dt>
                  <dd>{policy.summary}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </main>

      <footer className="store-foot">
        <div className="store-inner">
          <p>
            Questions? Our team is available {brand.supportHours} at{' '}
            <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.
          </p>
        </div>
      </footer>
    </div>
  );
}
