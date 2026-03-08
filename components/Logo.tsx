interface LogoProps {
  white?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: { text: "1.6rem",  line: "2px", gap: "3px" },
  md: { text: "2.1rem",  line: "3px", gap: "4px" },
  lg: { text: "2.6rem",  line: "3px", gap: "5px" },
};

const gradient = "linear-gradient(to right, #0d9488, #0891b2)";

export default function Logo({ white = false, className = "", size = "md" }: LogoProps) {
  const { text, line, gap } = sizes[size];

  return (
    <div className={`inline-flex flex-col ${className}`}>
      <span
        style={{
          fontFamily: "var(--font-poppins), Poppins, sans-serif",
          fontWeight: 800,
          fontSize: text,
          lineHeight: 1,
          letterSpacing: "-0.03em",
          ...(white
            ? { color: "white" }
            : {
                background: gradient,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }),
        }}
      >
        DermaCloud
      </span>
      <div
        style={{
          height: line,
          borderRadius: "2px",
          background: white ? "white" : gradient,
          marginTop: gap,
        }}
      />
    </div>
  );
}
