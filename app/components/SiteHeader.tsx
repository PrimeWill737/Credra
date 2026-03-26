"use client";

import { useEffect, useState } from "react";
import { CredraLogo } from "./CredraLogo";

const links = [
  { href: "#product", label: "Product" },
  { href: "#flow", label: "Flow" },
  { href: "#cta", label: "Contact" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className={`site-header ${scrolled ? "site-header--raised" : ""}`}>
      <div className="site-header__inner">
        <a href="/" className="site-header__logo">
          <CredraLogo className="site-header__logo-img" priority height={34} />
          <span className="site-header__wordmark">CREDRA</span>
        </a>

        <button
          type="button"
          className="site-header__menu-btn"
          aria-expanded={open}
          aria-controls="site-nav"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <span className={`site-header__burger ${open ? "site-header__burger--open" : ""}`} />
        </button>

        <nav
          id="site-nav"
          className={`site-header__nav ${open ? "site-header__nav--open" : ""}`}
          aria-label="Primary"
        >
          <ul className="site-header__links">
            {links.map(({ href, label }) => (
              <li key={href}>
                <a
                  href={href}
                  className="site-header__link"
                  onClick={() => setOpen(false)}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <a
            className="btn btn--primary site-header__cta"
            href="/client"
            onClick={() => setOpen(false)}
          >
            Request access
          </a>
        </nav>
      </div>
    </header>
  );
}
