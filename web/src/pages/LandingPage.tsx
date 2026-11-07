import { ArrowRight } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { Logo } from '../components/Logo';
import { buttonClass } from '../components/ui';
import { useWidget } from '../lib/useWidget';

const STEPS = [
  { title: 'Retrieve', body: 'Each question is matched against your products, policies, and FAQs, using the previous turn to make sense of follow-ups.' },
  { title: 'Ground', body: 'Only the matching entries reach the model, under strict rules: no invented prices, specs, discounts, or policies.' },
  { title: 'Answer or refer', body: "If the facts aren't there, the assistant says so and points the customer to your team instead of guessing." },
  { title: 'Learn', body: "Unanswered questions land in a report. Answer one once, and the assistant can handle it from then on." },
];

const FEATURES = [
  { title: 'Knowledge you control', body: 'Edit entries in the console or import a CSV or JSON file, with a preview of every change first. Updates apply to the next reply.' },
  { title: 'Every reply is traceable', body: 'Read any conversation and see which entries grounded each answer, how long it took, and how the customer rated it.' },
  { title: 'A clean path to people', body: 'Customers can ask for a person at any point. Requests arrive in a handoff inbox with the full conversation attached.' },
  { title: 'One line to embed', body: "A dependency-free widget that can't clash with your site's styles. Your API key stays on the server." },
];

export function LandingPage() {
  const chat = useRef<HTMLDivElement>(null);
  const [widgetFailed, setWidgetFailed] = useState(false);
  useWidget(chat, () => setWidgetFailed(true));

  return (
    <div className="site">
      <header className="site-nav">
        <Link to="/" aria-label="Groundline home"><Logo /></Link>
        <nav aria-label="Site">
          <a href="#how">How it works</a>
          <Link to="/demo">Store demo</Link>
          <Link to="/app" className={buttonClass()}>Open console</Link>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1>Support answers that stick to the facts.</h1>
            <p className="hero-lede">
              Groundline answers customer questions using only your own products and policies. When it doesn't know, it says so,
              hands off to your team, and tells you what to add.
            </p>
            <div className="hero-actions">
              <Link to="/app" className={buttonClass('primary', 'lg')}>Open the console <ArrowRight /></Link>
              <Link to="/demo" className={buttonClass('default', 'lg')}>See it on a storefront</Link>
            </div>
          </div>
          <div className="hero-demo">
            <div className="hero-demo-frame" ref={chat}>
              {widgetFailed ? <p className="muted hero-demo-error">The live demo couldn't load. Please refresh the page.</p> : null}
            </div>
            <p className="hero-demo-note">
              This is the live assistant, not a recording. It's answering as Nimbus Audio, a fictional store. Try asking for a discount code.
            </p>
          </div>
        </section>

        <section className="site-section" id="how">
          <h2>How a reply gets made</h2>
          <ol className="steps">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <span className="step-number tnum">{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="site-section">
          <h2>Built for the team running it</h2>
          <ul className="features">
            {FEATURES.map((feature) => (
              <li key={feature.title}>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="site-cta">
          <div>
            <h2>Add it to a site with one line</h2>
            <code>&lt;script src="{window.location.origin}/widget.js" defer&gt;&lt;/script&gt;</code>
          </div>
          <Link to="/demo" className={buttonClass('primary', 'lg')}>Try the store demo</Link>
        </section>
      </main>

      <footer className="site-foot">
        <Logo />
        <span className="muted">Portfolio project. The Nimbus Audio brand, its products, and its policies are fictional sample data.</span>
      </footer>
    </div>
  );
}
