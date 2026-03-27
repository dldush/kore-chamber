// English abbreviations that stay uppercase
const ABBREVIATIONS = new Set([
  "DB", "API", "JWT", "RSC", "SSR", "SSG", "ISR", "CSR",
  "CSS", "HTML", "MSA", "REST", "GraphQL", "SQL", "NoSQL",
  "ORM", "MVC", "MVVM", "CI", "CD", "AWS", "GCP", "DNS",
  "HTTP", "HTTPS", "TCP", "UDP", "TLS", "SSL", "XSS", "CSRF",
  "CORS", "OAuth", "OIDC", "RBAC", "DOM", "WASM", "PWA",
  "SPA", "MPA", "BFF", "CDN", "DDD", "TDD", "BDD",
  "React", "Next", "Vue", "Svelte", "Angular", "Node",
  "Docker", "Redis", "Kafka", "Nginx", "Linux", "Git",
  "TypeScript", "JavaScript", "Python", "Go", "Rust",
  "Zustand", "Zod", "Prisma", "Tailwind", "Webpack", "Vite",
]);

// Korean particles and connectors to remove
const PARTICLES = /[은는이가을를의와과에서로부터까지도만도]/g;

export function generateSlug(title: string): string {
  // Split by spaces and common delimiters
  const words = title
    .split(/[\s,;:—–\-/\\]+/)
    .filter((w) => w.length > 0);

  const slugParts: string[] = [];

  for (const word of words) {
    // Check if it's a known abbreviation/proper noun (case-insensitive match)
    const abbr = [...ABBREVIATIONS].find(
      (a) => a.toLowerCase() === word.toLowerCase()
    );

    if (abbr) {
      slugParts.push(abbr);
    } else if (/^[a-zA-Z]/.test(word)) {
      // English word — lowercase unless it's a proper noun
      slugParts.push(word.toLowerCase());
    } else {
      // Korean or other — strip particles, keep as-is
      const cleaned = word.replace(PARTICLES, "");
      if (cleaned) slugParts.push(cleaned);
    }
  }

  // Limit to 5 words
  return slugParts.slice(0, 5).join("-");
}
