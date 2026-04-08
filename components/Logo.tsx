interface LogoProps {
  white?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizes = {
  sm: 40,
  md: 60,
  lg: 90,
  xl: 130,
};

export default function Logo({ white = false, className = "", size = "md" }: LogoProps) {
  const px = sizes[size];

  return (
    <img
      src="/images/D.png"
      alt="DermaCloud"
      width={px}
      height={px}
      className={`${white ? "brightness-0 invert" : ""} ${className}`}
      style={{ objectFit: "contain" }}
    />
  );
}
