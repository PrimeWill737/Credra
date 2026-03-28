"use client";

import { useEffect, useState } from "react";
import { CREDRA_CLIENT_TOKEN_LS_KEY } from "../lib/clientSessionStorage";

type Props = {
  className?: string;
  href: string;
  loggedInLabel: string;
  loggedOutLabel: string;
  onNavigate?: () => void;
};

export function ClientWorkspaceCta({
  className,
  href,
  loggedInLabel,
  loggedOutLabel,
  onNavigate,
}: Props) {
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        const t = localStorage.getItem(CREDRA_CLIENT_TOKEN_LS_KEY);
        setHasSession(Boolean(t?.trim()));
      } catch {
        setHasSession(false);
      }
    };

    read();

    const onStorage = (e: StorageEvent) => {
      if (e.key === CREDRA_CLIENT_TOKEN_LS_KEY || e.key === null) {
        read();
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", read);
    window.addEventListener("pageshow", read);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", read);
      window.removeEventListener("pageshow", read);
    };
  }, []);

  return (
    <a
      className={className}
      href={href}
      onClick={() => onNavigate?.()}
    >
      {hasSession ? loggedInLabel : loggedOutLabel}
    </a>
  );
}
