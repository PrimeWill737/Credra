import Image from "next/image";
import logo from "../img/logo.png";

type CredraLogoProps = {
  className?: string;
  priority?: boolean;
  /** Display height in CSS pixels; width scales with aspect ratio. */
  height?: number;
};

export function CredraLogo({ className, priority, height = 34 }: CredraLogoProps) {
  const w = Math.max(1, Math.round((logo.width / logo.height) * height));
  return (
    <Image
      src={logo}
      alt="CREDRA"
      width={w}
      height={height}
      className={className}
      priority={priority}
    />
  );
}
