export const meta = (title: string, description: string) => ({
  meta: [
    { title: `${title} — FertiFlow` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} — FertiFlow` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ],
});
