import Image from "next/image";
import { CredraLogo } from "./components/CredraLogo";
import { HeroMegaCard } from "./components/HeroMegaCard";
import { Reveal } from "./components/Reveal";
import { SiteHeader } from "./components/SiteHeader";
import creditScoreImg from "./img/credit-score.jpg";
import heroImg from "./img/hero.jpg";

export default function HomePage() {
  return (
    <div className="shell">
      <SiteHeader />

      <main className="landing-main">
        <section className="hero-mega" aria-labelledby="hero-title">
          <div className="hero-mega__grid">
            <div className="hero-mega__stage">
              <p className="hero-mega__kicker">Credit &amp; fraud signals · API-first</p>
              <h1 id="hero-title" className="hero-mega__title">
                <span className="hero-mega__line">Underwriting shouldn’t rely on</span>
                <span className="hero-mega__line">
                  a payslip that{" "}
                  <span className="hero-mega__em">doesn’t exist</span>.
                </span>
                <span className="hero-mega__line">Use behaviour you can verify.</span>
              </h1>
              <p className="hero-mega__lead">
                CREDRA links verified accounts, turns cashflow into structured signals,
                and returns a single risk posture your team can wire into approvals—built
                for irregular income, mobile money patterns, and the way people actually
                earn and spend.
              </p>
              <div className="hero-mega__actions">
                <a className="btn btn--primary" href="/client">
                  Request access
                </a>
                <a className="btn btn--ghost" href="#product">
                  What you ship
                </a>
              </div>
              <p className="hero-mega__note">
                You stay the regulated surface; we stay the scoring and plumbing behind
                your APIs.
              </p>
            </div>

            <div className="hero-mega__rail">
              <div className="hero-mega__visual" aria-hidden>
                <Image
                  src={heroImg}
                  alt=""
                  fill
                  className="hero-mega__visual-img"
                  sizes="(max-width: 959px) 100vw, 38vw"
                  priority
                />
              </div>
              <HeroMegaCard />
            </div>
          </div>
        </section>

        <Reveal variant="auto" delayMs={20}>
          <div className="pulse-strip">
            <div className="pulse-strip__inner">
              <div className="pulse-strip__item">
                <h3>Grounded in cashflow</h3>
                <p>
                  Scores come from what hits the account—not self-reported forms that go
                  stale the same afternoon.
                </p>
              </div>
              <div className="pulse-strip__item">
                <h3>Built for messy reality</h3>
                <p>
                  Gig work, remittances, and lumpy inflows are features, not exceptions—if
                  your underwriting model knows how to read them.
                </p>
              </div>
              <div className="pulse-strip__item">
                <h3>Decisions you can defend</h3>
                <p>
                  Exports and audit-friendly summaries so compliance isn’t an afterthought
                  when someone asks why a case was declined.
                </p>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal variant="left">
          <section className="story-split" aria-labelledby="story-title">
            <div className="story-split__grid">
              <div className="story-split__visual" aria-hidden>
                <Image
                  src={creditScoreImg}
                  alt=""
                  fill
                  className="story-split__visual-img"
                  sizes="(max-width: 879px) 100vw, 42vw"
                />
              </div>
              <div>
                <p className="story-split__tag">Why teams use CREDRA</p>
                <h2 id="story-title" className="story-split__title">
                  Credit decisions fail quietly when the data is thin—and loud when it’s
                  wrong.
                </h2>
                <p className="story-split__body">
                  Most “AI credit” demos stop at a leaderboard model. CREDRA starts where
                  your product already hurts: pulling reliable history, cleaning it
                  without inventing facts, and returning a score your ops team can explain
                  to a partner bank.
                </p>
                <p className="story-split__body">
                  We’re not a lender. We’re the infrastructure that sits between open
                  banking and your approval rules—so you can ship faster without trading
                  away rigor.
                </p>
                <ul className="story-split__list">
                  <li>Consent-based account history you can rely on</li>
                  <li>Clean timelines and consistent signals—not guesswork</li>
                  <li>Scores and summaries your team can explain to partners</li>
                </ul>
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal variant="right" delayMs={40}>
          <section id="product" className="product-panel">
            <div className="product-panel__head">
              <h2 className="product-panel__title">What you actually integrate</h2>
              <p className="product-panel__lede">
                A thin API surface that stays testable—so your engineers spend time on
                product, not on rebuilding data plumbing for the fifth time.
              </p>
            </div>
            <div className="product-panel__grid">
              <article className="product-card">
                <p className="product-card__label">For product</p>
                <h3 className="product-card__name">Approval workflows</h3>
                <p className="product-card__text">
                  Route applicants to approve / review / decline with consistent
                  thresholds across channels—web, agent, or partner white-label.
                </p>
              </article>
              <article className="product-card">
                <p className="product-card__label">For risk</p>
                <h3 className="product-card__name">Fraud &amp; abuse signals</h3>
                <p className="product-card__text">
                  Catch velocity anomalies and inconsistent stories early—before they
                  become portfolio surprises.
                </p>
              </article>
              <article className="product-card">
                <p className="product-card__label">For partnerships</p>
                <h3 className="product-card__name">B2B-ready reporting</h3>
                <p className="product-card__text">
                  Summaries your bank partners can read without extra demos and
                  follow-up calls.
                </p>
              </article>
            </div>
          </section>
        </Reveal>

        <Reveal variant="auto" delayMs={60}>
          <section className="flow-section" id="flow" aria-labelledby="flow-title">
            <h2 id="flow-title" className="flow-section__title">
              From link to decision
            </h2>
            <p className="flow-section__subtitle">
              The same path your customer experiences—without hand-waving what happens in
              the middle.
            </p>
            <div className="flow-rail">
              <article className="flow-rail__card">
                <p className="flow-rail__step">Step 1</p>
                <h3 className="flow-rail__h">Connect</h3>
                <p className="flow-rail__p">
                  The applicant authorizes the connection from your app. CREDRA pulls
                  history and balances under consent—not screen scraping and hope.
                </p>
              </article>
              <article className="flow-rail__card">
                <p className="flow-rail__step">Step 2</p>
                <h3 className="flow-rail__h">Normalize</h3>
                <p className="flow-rail__p">
                  Duplicates cleaned, spend classified, and a timeline you can query
                  without duct-taped spreadsheets.
                </p>
              </article>
              <article className="flow-rail__card">
                <p className="flow-rail__step">Step 3</p>
                <h3 className="flow-rail__h">Decide</h3>
                <p className="flow-rail__p">
                  A score and bands your rules engine maps to approve, decline, or
                  manual review—delivered through your integration.
                </p>
              </article>
            </div>
          </section>
        </Reveal>

        <Reveal variant="left" delayMs={40}>
          <section className="audience" aria-labelledby="audience-title">
            <div className="audience__panel">
              <h2 id="audience-title" className="audience__title">
                Built for teams shipping credit in the real economy
              </h2>
              <div className="audience__cols">
                <div className="audience__col">
                  <h4>Where it fits</h4>
                  <ul>
                    <li>Digital lenders &amp; BNPL</li>
                    <li>Embedded finance &amp; marketplaces</li>
                    <li>Insurance underwriting workflows</li>
                  </ul>
                </div>
                <div className="audience__col">
                  <h4>What you avoid</h4>
                  <ul>
                    <li>Rebuilding bank parsers every quarter</li>
                    <li>Opaque scores nobody can explain</li>
                    <li>Governance gaps when scoring isn’t production-grade</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal variant="right" delayMs={30}>
          <section id="cta" className="cta-final" aria-labelledby="cta-title">
            <div className="cta-final__box">
              <div className="cta-final__inner">
                <h2 id="cta-title" className="cta-final__title">
                  Infrastructure—not a balance sheet
                </h2>
                <p className="cta-final__text">
                  We don’t hold customer funds. CREDRA is the intelligence layer licensed
                  partners plug into—so you can move fast without stepping outside your
                  regulatory lane.
                </p>
                <a className="btn btn--primary" href="mailto:williambosworth777@icloud.com">
                  williambosworth777@icloud.com
                </a>
                <p className="cta-final__fine">
                  Tell us what you’re underwriting and what “good” looks like for your
                  portfolio—we’ll map the integration path.
                </p>
              </div>
            </div>
          </section>
        </Reveal>
      </main>

      <footer className="site-footer">
        <div className="site-footer__row">
          <span className="site-footer__copyright">
            © {new Date().getFullYear()}{" "}
            <a
              href="/admin"
              className="site-footer__brand"
              aria-label="CREDRA — admin sign-in"
            >
              <CredraLogo className="site-footer__logo" height={22} />
              <span>CREDRA</span>
            </a>
          </span>
          <span className="site-footer__meta">Lagos · London · remote</span>
        </div>
      </footer>
    </div>
  );
}
