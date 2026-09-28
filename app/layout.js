import "./globals.css";

export const metadata = {
  title: "LinkedIn Poster",
  description: "Post to your own LinkedIn profile from a private endpoint.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
